import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { getSmartAccountInfo } from '../wallet-core/account.js'
import { chainName } from '../wallet-core/chains.js'
import { saveConfigField } from '../config/bootstrap.js'
import type { MakiContext } from './context.js'

export function registerAccountTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  // ── Smart account creation (Secure Enclave path) ──────────────────
  pi.registerTool({
    name: 'create_smart_account',
    label: 'Create Smart Account',
    description:
      'Create a new ERC-4337 smart account (Coinbase Smart Wallet) backed by the Secure Enclave. Returns the counterfactual address. Not used in Ledger EOA demo mode.',
    promptSnippet: 'create_smart_account: deploy a new smart account with Secure Enclave signer',
    promptGuidelines: [
      'Use when the user wants to set up their wallet for the first time.',
      'The account is counterfactual — the address is known before deployment.',
      'Actual on-chain deployment happens with the first UserOperation.',
      'Do NOT use this in Ledger EOA demo mode — use setup_ledger_account instead.',
    ],
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()

      if (maki.accountMode === 'eoa-demo') {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Ledger EOA demo mode is active. Smart account creation is not applicable.\nUse setup_ledger_account to configure the Ledger EOA address.',
            },
          ],
          details: { error: 'eoa-demo mode' },
        }
      }

      // Ensure signer has a key
      const createKey = await maki.signer.createKey()

      // Get account info
      const info = await getSmartAccountInfo(maki.chainClient, maki.signer)

      const keyStorage = createKey.keyStorage ?? 'persistent'
      const isSessionOnly = keyStorage === 'ephemeral'

      // Persist only when the signer has a durable key.
      if (!isSessionOnly) {
        saveConfigField('smartAccountAddress', info.address)
      }
      maki.config.smartAccountAddress = info.address

      const ownerLabel = `Owner public key (P-256): ${info.ownerPublicKey.slice(0, 20)}...`

      const lines = [
        `Smart Account created on ${chainName(maki.config.chainId)}`,
        `Address: ${info.address}`,
        `Deployed: ${info.isDeployed ? 'yes' : 'no (will deploy on first transaction)'}`,
        ownerLabel,
        `Signer mode: ${maki.signerMode}`,
        `Key storage: ${keyStorage}`,
        '',
        ...(isSessionOnly
          ? [
              'Session-only Secure Enclave key: this address is valid only while the signer daemon keeps running.',
              'Address was not saved to ~/.maki/config.yaml.',
            ]
          : ['Address saved to ~/.maki/config.yaml.']),
        'Fund this address with ETH to start using it.',
      ]

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: {
          address: info.address,
          isDeployed: info.isDeployed,
          chainId: maki.config.chainId,
          signerMode: maki.signerMode,
          keyStorage,
        },
      }
    },
  })

  // ── Ledger EOA account setup ──────────────────────────────────────
  pi.registerTool({
    name: 'setup_ledger_account',
    label: 'Setup Ledger Account',
    description:
      'Fetch the Ledger-derived EOA address and save it as the active address. Used in Ledger EOA demo mode.',
    promptSnippet: 'setup_ledger_account: fetch Ledger EOA address and activate it',
    promptGuidelines: [
      'Use when in Ledger EOA demo mode and the user wants to set up their wallet.',
      'Queries the Ledger device for the derived address.',
      'Saves the address to ~/.maki/config.yaml as ledgerAddress.',
      'This is NOT a smart account — it is a direct EOA backed by Ledger hardware.',
    ],
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()

      if (maki.accountMode !== 'eoa-demo') {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Not in Ledger EOA demo mode. Use create_smart_account instead.',
            },
          ],
          details: { error: 'not eoa-demo mode' },
        }
      }

      if (maki.signerMode !== 'ledger') {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Ledger signer not connected. Start the signer daemon with: maki signer start',
            },
          ],
          details: { error: 'no ledger signer' },
        }
      }

      // Query Ledger device for the EOA address
      let address: `0x${string}`
      if (maki.signer.getAddress) {
        const result = await maki.signer.getAddress()
        address = result.address
      } else {
        const result = await maki.signer.getPublicKey()
        address = result.address
      }

      // Persist
      saveConfigField('ledgerAddress', address)
      maki.config.ledgerAddress = address

      const lines = [
        `Ledger EOA account ready on ${chainName(maki.config.chainId)}`,
        `Address: ${address}`,
        `Account mode: EOA demo (direct transactions, no bundler)`,
        `Signer: Ledger (${maki.config.ledger?.transport ?? 'speculos'})`,
        '',
        'Address saved to ~/.maki/config.yaml.',
        'Fund this address with ETH to start using it.',
      ]

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: {
          address,
          accountMode: 'eoa-demo',
          chainId: maki.config.chainId,
          signerMode: maki.signerMode,
        },
      }
    },
  })

  // ── Account info (works for both modes) ───────────────────────────
  pi.registerTool({
    name: 'get_account_info',
    label: 'Get Account Info',
    description:
      'Get details about the active account. In smart-account mode, shows deployment status and owner key. In Ledger EOA demo mode, shows the EOA address.',
    promptSnippet: 'get_account_info: check account address and status',
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()

      // Ledger EOA demo mode
      if (maki.accountMode === 'eoa-demo') {
        const address = maki.config.ledgerAddress
        const lines = [
          `Account mode: Ledger EOA demo`,
          `Chain: ${chainName(maki.config.chainId)}`,
          `Address: ${address ?? 'not set — run setup_ledger_account'}`,
          `Signer: Ledger (${maki.config.ledger?.transport ?? 'speculos'})`,
          `Execution: direct EOA transactions (no bundler / no UserOperations)`,
        ]
        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
          details: { accountMode: 'eoa-demo', address, chainId: maki.config.chainId },
        }
      }

      // Smart-account mode
      const info = await getSmartAccountInfo(maki.chainClient, maki.signer)

      const lines = [
        `Account mode: Smart Account (ERC-4337)`,
        `Address: ${info.address}`,
        `Chain: ${chainName(maki.config.chainId)}`,
        `Deployed: ${info.isDeployed}`,
        `Owner type: ${info.ownerType}`,
      ]

      if (info.ownerType === 'ledger') {
        lines.push(`Owner address: ${info.ownerAddress ?? 'unknown'}`)
      } else {
        lines.push(`Owner X: ${info.ownerX ?? 'N/A'}`)
        lines.push(`Owner Y: ${info.ownerY ?? 'N/A'}`)
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: info,
      }
    },
  })
}
