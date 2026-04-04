/**
 * ERC-7730 Clear Signing descriptor generation for Maki-supported actions.
 *
 * Generates JSON descriptors that map calldata to human-readable fields
 * following the ERC-7730 specification. These descriptors enable Ledger
 * devices to display structured transaction details instead of raw hex.
 *
 * Supported actions:
 * - Native ETH transfer (via smart account execute)
 * - ERC-20 transfer
 * - ERC-20 approve
 * - ERC-20 revoke (approve to zero)
 */

export interface Erc7730Deployment {
  chainId: number
  address: string
}

export interface Erc7730Field {
  path: string
  label: string
  format: string
  params?: Record<string, unknown>
}

export interface Erc7730Format {
  intent: string
  fields: Erc7730Field[]
  required: string[]
}

export interface Erc7730Descriptor {
  $schema: string
  context: {
    contract: {
      abi: readonly Record<string, unknown>[]
      deployments: Erc7730Deployment[]
    }
  }
  metadata: {
    owner: string
    info?: {
      legalName?: string
      url?: string
    }
  }
  display: {
    formats: Record<string, Erc7730Format>
  }
}

// Standard ERC-20 ABI fragments used in descriptors
const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

const ERC20_APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

/**
 * Generates an ERC-7730 descriptor for ERC-20 transfer.
 */
export function generateErc20TransferDescriptor(deployments: Erc7730Deployment[]): Erc7730Descriptor {
  return {
    $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v1.schema.json',
    context: {
      contract: {
        abi: ERC20_TRANSFER_ABI,
        deployments,
      },
    },
    metadata: {
      owner: 'Maki',
      info: {
        legalName: 'Maki Terminal Agent',
        url: 'https://github.com/maki-agent',
      },
    },
    display: {
      formats: {
        'transfer(address,uint256)': {
          intent: 'Send tokens',
          fields: [
            { path: '_to', label: 'To', format: 'addressOrName' },
            {
              path: '_value',
              label: 'Amount',
              format: 'tokenAmount',
              params: { tokenPath: '@.to' },
            },
          ],
          required: ['_to', '_value'],
        },
      },
    },
  }
}

/**
 * Generates an ERC-7730 descriptor for ERC-20 approve.
 * Covers both approve and revoke (approve to 0).
 */
export function generateErc20ApproveDescriptor(deployments: Erc7730Deployment[]): Erc7730Descriptor {
  return {
    $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v1.schema.json',
    context: {
      contract: {
        abi: ERC20_APPROVE_ABI,
        deployments,
      },
    },
    metadata: {
      owner: 'Maki',
      info: {
        legalName: 'Maki Terminal Agent',
        url: 'https://github.com/maki-agent',
      },
    },
    display: {
      formats: {
        'approve(address,uint256)': {
          intent: 'Approve token spending',
          fields: [
            { path: '_spender', label: 'Spender', format: 'addressOrName' },
            {
              path: '_value',
              label: 'Allowance',
              format: 'tokenAmount',
              params: { tokenPath: '@.to' },
            },
          ],
          required: ['_spender', '_value'],
        },
      },
    },
  }
}

/**
 * Well-known ERC-20 tokens on Base for descriptor generation.
 */
const WELL_KNOWN_TOKENS: Record<string, Erc7730Deployment[]> = {
  USDC: [
    { chainId: 8453, address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
    { chainId: 84532, address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
  ],
  WETH: [
    { chainId: 8453, address: '0x4200000000000000000000000000000000000006' },
    { chainId: 84532, address: '0x4200000000000000000000000000000000000006' },
  ],
}

/**
 * Generates all Maki-supported clear signing descriptors.
 * Returns a map of descriptor name → JSON descriptor.
 */
export function generateAllDescriptors(): Record<string, Erc7730Descriptor> {
  const descriptors: Record<string, Erc7730Descriptor> = {}

  // ERC-20 descriptors for well-known tokens
  for (const [symbol, deployments] of Object.entries(WELL_KNOWN_TOKENS)) {
    descriptors[`erc20-transfer-${symbol.toLowerCase()}`] = generateErc20TransferDescriptor(deployments)
    descriptors[`erc20-approve-${symbol.toLowerCase()}`] = generateErc20ApproveDescriptor(deployments)
  }

  return descriptors
}

/**
 * Validates an ERC-7730 descriptor against basic structural requirements.
 */
export function validateDescriptor(descriptor: Erc7730Descriptor): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!descriptor.$schema) {
    errors.push('Missing $schema field')
  }

  if (!descriptor.context?.contract?.abi?.length) {
    errors.push('Missing or empty contract ABI')
  }

  if (!descriptor.context?.contract?.deployments?.length) {
    errors.push('Missing or empty deployments')
  }

  if (!descriptor.metadata?.owner) {
    errors.push('Missing metadata.owner')
  }

  const formats = descriptor.display?.formats
  if (!formats || Object.keys(formats).length === 0) {
    errors.push('Missing or empty display.formats')
  } else {
    for (const [sig, format] of Object.entries(formats)) {
      if (!format.intent) {
        errors.push(`Missing intent for format ${sig}`)
      }
      if (!format.fields?.length) {
        errors.push(`Missing fields for format ${sig}`)
      }
      for (const field of format.fields ?? []) {
        if (!field.path) errors.push(`Missing path in field for ${sig}`)
        if (!field.label) errors.push(`Missing label in field for ${sig}`)
        if (!field.format) errors.push(`Missing format in field for ${sig}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
