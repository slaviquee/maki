import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SmartAccount } from 'viem/account-abstraction'
import type { UserOpCall } from './userop.js'
import type { SubmissionConfig } from './submit.js'

const createBundlerClient = vi.fn(() => ({
  sendUserOperation,
  waitForUserOperationReceipt,
}))
const getUserOperationGasPrice = vi.fn()
const sendUserOperation = vi.fn()
const waitForUserOperationReceipt = vi.fn()

vi.mock('viem/account-abstraction', () => ({
  createBundlerClient,
}))

vi.mock('permissionless/clients/pimlico', () => ({
  createPimlicoClient: () => ({
    getUserOperationGasPrice,
  }),
}))

const MOCK_CALLS: UserOpCall[] = [
  {
    to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    value: 1000000000000000n,
  },
]

const MOCK_CONFIG: SubmissionConfig = {
  chainId: 84532,
  bundlerApiKey: 'test-api-key',
}

const MOCK_ACCOUNT = {} as SmartAccount

describe('submitUserOperation', () => {
  beforeEach(() => {
    createBundlerClient.mockClear()
    getUserOperationGasPrice.mockReset()
    sendUserOperation.mockReset()
    waitForUserOperationReceipt.mockReset()
    getUserOperationGasPrice.mockResolvedValue({
      slow: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
      standard: { maxFeePerGas: 2n, maxPriorityFeePerGas: 2n },
      fast: { maxFeePerGas: 3n, maxPriorityFeePerGas: 3n },
    })
  })

  it('returns confirmed with tx hash on success', async () => {
    const { submitUserOperation } = await import('./submit.js')
    const userOpHash = '0xaabb' as `0x${string}`
    const txHash = '0xccdd' as `0x${string}`

    sendUserOperation.mockResolvedValueOnce(userOpHash)
    waitForUserOperationReceipt.mockResolvedValueOnce({
      success: true,
      receipt: { transactionHash: txHash },
      actualGasCost: 100000n,
      userOpHash,
    })

    const result = await submitUserOperation(MOCK_ACCOUNT, MOCK_CALLS, MOCK_CONFIG)
    expect(result.status).toBe('confirmed')
    expect(result.userOpHash).toBe(userOpHash)
    expect(result.txHash).toBe(txHash)
    expect(result.actualGasCost).toBe(100000n)
    expect(createBundlerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        account: MOCK_ACCOUNT,
        client: expect.any(Object),
      }),
    )
    expect(sendUserOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        calls: expect.any(Array),
        maxFeePerGas: 3n,
        maxPriorityFeePerGas: 3n,
      }),
    )
  })

  it('returns failed with reason on revert', async () => {
    const { submitUserOperation } = await import('./submit.js')
    const userOpHash = '0xaabb' as `0x${string}`
    const txHash = '0xccdd' as `0x${string}`

    sendUserOperation.mockResolvedValueOnce(userOpHash)
    waitForUserOperationReceipt.mockResolvedValueOnce({
      success: false,
      receipt: { transactionHash: txHash },
      actualGasCost: 50000n,
      userOpHash,
      reason: 'AA21 out of gas',
    })

    const result = await submitUserOperation(MOCK_ACCOUNT, MOCK_CALLS, MOCK_CONFIG)
    expect(result.status).toBe('failed')
    expect(result.error).toBe('AA21 out of gas')
    expect(result.txHash).toBe(txHash)
  })

  it('throws on unsupported chain', async () => {
    const { submitUserOperation } = await import('./submit.js')
    await expect(
      submitUserOperation(MOCK_ACCOUNT, MOCK_CALLS, {
        chainId: 1 as 8453,
        bundlerApiKey: 'key',
      }),
    ).rejects.toThrow('No bundler available for chain 1')
  })

  it('refreshes gas price and retries once on stale tip rejection', async () => {
    const { submitUserOperation } = await import('./submit.js')
    const userOpHash = '0xaabb' as `0x${string}`
    const txHash = '0xccdd' as `0x${string}`

    getUserOperationGasPrice
      .mockResolvedValueOnce({
        slow: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
        standard: { maxFeePerGas: 2n, maxPriorityFeePerGas: 2n },
        fast: { maxFeePerGas: 3n, maxPriorityFeePerGas: 3n },
      })
      .mockResolvedValueOnce({
        slow: { maxFeePerGas: 4n, maxPriorityFeePerGas: 4n },
        standard: { maxFeePerGas: 5n, maxPriorityFeePerGas: 5n },
        fast: { maxFeePerGas: 6n, maxPriorityFeePerGas: 6n },
      })

    sendUserOperation
      .mockRejectedValueOnce(
        new Error(
          'maxPriorityFeePerGas must be at least 6557474 (current maxPriorityFeePerGas: 2000000) - use pimlico_getUserOperationGasPrice to get the current gas price',
        ),
      )
      .mockResolvedValueOnce(userOpHash)

    waitForUserOperationReceipt.mockResolvedValueOnce({
      success: true,
      receipt: { transactionHash: txHash },
      actualGasCost: 100000n,
      userOpHash,
    })

    const result = await submitUserOperation(MOCK_ACCOUNT, MOCK_CALLS, MOCK_CONFIG)

    expect(result.status).toBe('confirmed')
    expect(getUserOperationGasPrice).toHaveBeenCalledTimes(2)
    expect(sendUserOperation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        maxFeePerGas: 3n,
        maxPriorityFeePerGas: 3n,
      }),
    )
    expect(sendUserOperation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        maxFeePerGas: 6n,
        maxPriorityFeePerGas: 6n,
      }),
    )
  })
})
