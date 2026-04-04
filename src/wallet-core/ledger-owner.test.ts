import { describe, it, expect, vi } from 'vitest'
import { createLedgerOwner } from './ledger-owner.js'
import type { SignerClient } from '../signer/types.js'

function createMockLedgerSigner(): SignerClient {
  const mockSig = '0x' + 'ab'.repeat(32) + 'cd'.repeat(32) + '1b'

  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    ping: vi.fn(),
    status: vi.fn().mockResolvedValue({ ready: true, signerType: 'ledger', hasKey: true }),
    getPublicKey: vi.fn().mockResolvedValue({
      publicKey: '0x04' + 'aa'.repeat(64),
      address: '0x' + 'ee'.repeat(20),
    }),
    getPublicKeyCoordinates: vi.fn(),
    createKey: vi.fn(),
    signHash: vi.fn(),
    approveAction: vi.fn(),
    getAddress: vi.fn().mockResolvedValue({
      address: ('0x' + 'ee'.repeat(20)) as `0x${string}`,
      publicKey: '0x04' + 'aa'.repeat(64),
    }),
    signPersonalMessage: vi.fn().mockResolvedValue({
      signature: mockSig as `0x${string}`,
      r: ('0x' + 'ab'.repeat(32)) as `0x${string}`,
      s: ('0x' + 'cd'.repeat(32)) as `0x${string}`,
      v: 27,
      approved: true,
    }),
    signTypedData: vi.fn().mockResolvedValue({
      signature: mockSig as `0x${string}`,
      r: ('0x' + 'ab'.repeat(32)) as `0x${string}`,
      s: ('0x' + 'cd'.repeat(32)) as `0x${string}`,
      v: 27,
      approved: true,
    }),
  }
}

describe('createLedgerOwner', () => {
  it('creates a LocalAccount with the correct address', () => {
    const signer = createMockLedgerSigner()
    const address = ('0x' + 'ee'.repeat(20)) as `0x${string}`
    const owner = createLedgerOwner(signer, address)

    expect(owner.address).toBe(address)
  })

  it('delegates signMessage to signer.signPersonalMessage', async () => {
    const signer = createMockLedgerSigner()
    const address = ('0x' + 'ee'.repeat(20)) as `0x${string}`
    const owner = createLedgerOwner(signer, address)

    const result = await owner.signMessage({ message: 'hello' })
    expect(result).toBeDefined()
    expect(signer.signPersonalMessage).toHaveBeenCalled()
  })

  it('delegates signTypedData to signer.signTypedData', async () => {
    const signer = createMockLedgerSigner()
    const address = ('0x' + 'ee'.repeat(20)) as `0x${string}`
    const owner = createLedgerOwner(signer, address)

    const result = await owner.signTypedData({
      domain: { name: 'Test' },
      types: { Test: [{ name: 'value', type: 'uint256' }] },
      primaryType: 'Test',
      message: { value: 1n },
    })
    expect(result).toBeDefined()
    expect(signer.signTypedData).toHaveBeenCalled()
  })

  it('throws on signTransaction (not supported for smart account owners)', async () => {
    const signer = createMockLedgerSigner()
    const address = ('0x' + 'ee'.repeat(20)) as `0x${string}`
    const owner = createLedgerOwner(signer, address)

    await expect(
      owner.signTransaction({
        chainId: 84532,
        to: address,
        value: 0n,
        type: 'eip1559',
        maxFeePerGas: 0n,
        maxPriorityFeePerGas: 0n,
      }),
    ).rejects.toThrow('Direct transaction signing is not supported')
  })

  it('throws when signing is rejected on device', async () => {
    const signer = createMockLedgerSigner()
    ;(signer.signPersonalMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      signature: '0x',
      approved: false,
    })

    const address = ('0x' + 'ee'.repeat(20)) as `0x${string}`
    const owner = createLedgerOwner(signer, address)

    await expect(owner.signMessage({ message: 'hello' })).rejects.toThrow('Signing rejected on Ledger device')
  })

  it('uses provided signing context', async () => {
    const signer = createMockLedgerSigner()
    const address = ('0x' + 'ee'.repeat(20)) as `0x${string}`
    const owner = createLedgerOwner(signer, address, {
      actionSummary: 'Send 1 ETH to vitalik.eth',
      actionClass: 2,
    })

    await owner.signMessage({ message: 'test' })

    expect(signer.signPersonalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        actionSummary: 'Send 1 ETH to vitalik.eth',
        actionClass: 2,
      }),
    )
  })
})
