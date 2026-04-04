import { describe, it, expect } from 'vitest'
import {
  generateErc20TransferDescriptor,
  generateErc20ApproveDescriptor,
  generateAllDescriptors,
  validateDescriptor,
} from './erc7730.js'

const TEST_DEPLOYMENTS = [{ chainId: 84532, address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' }]

describe('ERC-7730 descriptor generation', () => {
  it('generates valid ERC-20 transfer descriptor', () => {
    const descriptor = generateErc20TransferDescriptor(TEST_DEPLOYMENTS)

    expect(descriptor.$schema).toBe('https://eips.ethereum.org/assets/eip-7730/erc7730-v1.schema.json')
    expect(descriptor.context.contract.deployments).toEqual(TEST_DEPLOYMENTS)
    expect(descriptor.metadata.owner).toBe('Maki')

    const format = descriptor.display.formats['transfer(address,uint256)']
    expect(format).toBeDefined()
    expect(format!.intent).toBe('Send tokens')
    expect(format!.fields).toHaveLength(2)
    expect(format!.fields[0]!.label).toBe('To')
    expect(format!.fields[1]!.label).toBe('Amount')
    expect(format!.required).toEqual(['_to', '_value'])
  })

  it('generates valid ERC-20 approve descriptor', () => {
    const descriptor = generateErc20ApproveDescriptor(TEST_DEPLOYMENTS)

    const format = descriptor.display.formats['approve(address,uint256)']
    expect(format).toBeDefined()
    expect(format!.intent).toBe('Approve token spending')
    expect(format!.fields).toHaveLength(2)
    expect(format!.fields[0]!.label).toBe('Spender')
    expect(format!.fields[1]!.label).toBe('Allowance')
  })

  it('generates all descriptors', () => {
    const all = generateAllDescriptors()
    const names = Object.keys(all)

    expect(names.length).toBeGreaterThanOrEqual(2)
    expect(names.some((n) => n.includes('transfer'))).toBe(true)
    expect(names.some((n) => n.includes('approve'))).toBe(true)
    expect(names.some((n) => n.includes('swap'))).toBe(false)
  })
})

describe('ERC-7730 descriptor validation', () => {
  it('validates a correct descriptor', () => {
    const descriptor = generateErc20TransferDescriptor(TEST_DEPLOYMENTS)
    const result = validateDescriptor(descriptor)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects descriptor with missing schema', () => {
    const descriptor = generateErc20TransferDescriptor(TEST_DEPLOYMENTS)
    const broken = { ...descriptor, $schema: '' }
    const result = validateDescriptor(broken)

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('$schema'))).toBe(true)
  })

  it('rejects descriptor with empty deployments', () => {
    const descriptor = generateErc20TransferDescriptor([])
    const result = validateDescriptor(descriptor)

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('deployments'))).toBe(true)
  })

  it('validates all generated descriptors', () => {
    const all = generateAllDescriptors()
    for (const [name, descriptor] of Object.entries(all)) {
      const result = validateDescriptor(descriptor)
      expect(result.valid, `Descriptor ${name} should be valid: ${result.errors.join(', ')}`).toBe(true)
    }
  })
})
