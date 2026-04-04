import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignerClient } from '../signer/types.js'

const mockToCoinbaseSmartAccount = vi.fn()
const mockGetUserOperationHash = vi.fn()

vi.mock('viem/account-abstraction', () => ({
  toCoinbaseSmartAccount: mockToCoinbaseSmartAccount,
  getUserOperationHash: mockGetUserOperationHash,
}))

function createMockLedgerSigner(): SignerClient {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    ping: vi.fn(),
    status: vi.fn().mockResolvedValue({ ready: true, signerType: 'ledger', hasKey: true }),
    getPublicKey: vi.fn().mockResolvedValue({
      publicKey: '0x04' + 'aa'.repeat(64),
      address: ('0x' + 'ee'.repeat(20)) as `0x${string}`,
    }),
    getPublicKeyCoordinates: vi.fn(),
    createKey: vi.fn(),
    signHash: vi.fn(),
    approveAction: vi.fn(),
    getAddress: vi.fn().mockResolvedValue({
      address: ('0x' + 'ee'.repeat(20)) as `0x${string}`,
      publicKey: '0x04' + 'aa'.repeat(64),
    }),
    signPersonalMessage: vi.fn(),
    signTypedData: vi.fn(),
  }
}

describe('createSmartAccount (ledger)', () => {
  beforeEach(() => {
    mockToCoinbaseSmartAccount.mockReset()
    mockGetUserOperationHash.mockReset()
  })

  it('routes signUserOperation through the smart account replay-safe sign path', async () => {
    const fakeSign = vi.fn().mockResolvedValue('0x' + '11'.repeat(65))
    mockToCoinbaseSmartAccount.mockResolvedValue({
      address: ('0x' + 'aa'.repeat(20)) as `0x${string}`,
      entryPoint: {
        address: ('0x' + 'bb'.repeat(20)) as `0x${string}`,
        version: '0.7',
      },
      getAddress: vi.fn().mockResolvedValue(('0x' + 'aa'.repeat(20)) as `0x${string}`),
      sign: fakeSign,
      signUserOperation: vi.fn(),
      isDeployed: vi.fn().mockResolvedValue(false),
    })
    mockGetUserOperationHash.mockReturnValue(('0x' + '22'.repeat(32)) as `0x${string}`)

    const { createSmartAccount } = await import('./account.js')

    const client = { chain: { id: 84532 } } as never
    const signer = createMockLedgerSigner()
    const account = await createSmartAccount(client, signer)

    const signature = await account.signUserOperation({
      nonce: 1n,
      callData: '0x',
      callGasLimit: 1n,
      verificationGasLimit: 1n,
      preVerificationGas: 1n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      signature: '0x',
    } as never)

    expect(mockGetUserOperationHash).toHaveBeenCalled()
    expect(fakeSign).toHaveBeenCalledWith({
      hash: ('0x' + '22'.repeat(32)) as `0x${string}`,
    })
    expect(signature).toBe('0x' + '11'.repeat(65))
  })
})
