import { describe, it, expect, vi } from 'vitest'
import { simulateCall, simulateCallSequence, estimateCallGas } from './simulation.js'
import type { PublicClient } from 'viem'
import type { SimulationCall } from './simulation.js'

const MOCK_FROM = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`
const MOCK_TO = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`

function createMockClient(overrides: Partial<PublicClient> = {}): PublicClient {
  return {
    call: vi.fn().mockResolvedValue({ data: '0x' }),
    getCode: vi.fn().mockResolvedValue('0x'),
    estimateGas: vi.fn().mockResolvedValue(21000n),
    getGasPrice: vi.fn().mockResolvedValue(1000000000n),
    ...overrides,
  } as unknown as PublicClient
}

describe('simulateCall', () => {
  it('returns success for a valid call', async () => {
    const client = createMockClient()
    const call: SimulationCall = { to: MOCK_TO, value: 1000n }
    const result = await simulateCall(client, MOCK_FROM, call)
    expect(result.success).toBe(true)
    expect(result.returnData).toBe('0x')
  })

  it('returns failure on revert', async () => {
    const client = createMockClient({
      call: vi.fn().mockRejectedValue(new Error('execution reverted')),
    } as unknown as Partial<PublicClient>)
    const call: SimulationCall = { to: MOCK_TO, value: 1000n }
    const result = await simulateCall(client, MOCK_FROM, call)
    expect(result.success).toBe(false)
    expect(result.error).toContain('execution reverted')
  })
})

describe('simulateCallSequence', () => {
  it('returns success for empty calls', async () => {
    const client = createMockClient()
    const result = await simulateCallSequence(client, MOCK_FROM, [])
    expect(result.success).toBe(true)
  })

  it('simulates single call directly', async () => {
    const client = createMockClient()
    const result = await simulateCallSequence(client, MOCK_FROM, [{ to: MOCK_TO, value: 1000n }])
    expect(result.success).toBe(true)
    expect(client.call).toHaveBeenCalledOnce()
  })

  it('skips batch simulation for counterfactual (undeployed) account', async () => {
    const client = createMockClient({
      getCode: vi.fn().mockResolvedValue('0x'), // no code = undeployed
    } as unknown as Partial<PublicClient>)
    const calls: SimulationCall[] = [
      { to: MOCK_TO, value: 1000n },
      { to: MOCK_TO, data: '0xabcd' as `0x${string}` },
    ]
    const result = await simulateCallSequence(client, MOCK_FROM, calls)
    expect(result.success).toBe(true)
    // Should only call getCode, not call() for batch
    expect(client.getCode).toHaveBeenCalledOnce()
  })

  it('simulates batch via executeBatch for deployed account', async () => {
    const client = createMockClient({
      getCode: vi.fn().mockResolvedValue('0x6080604052'), // has code
      call: vi.fn().mockResolvedValue({ data: '0x' }),
    } as unknown as Partial<PublicClient>)
    const calls: SimulationCall[] = [
      { to: MOCK_TO, value: 1000n },
      { to: MOCK_TO, data: '0xabcd' as `0x${string}` },
    ]
    const result = await simulateCallSequence(client, MOCK_FROM, calls)
    expect(result.success).toBe(true)
  })
})

describe('estimateCallGas', () => {
  it('returns gas estimate and cost', async () => {
    const client = createMockClient()
    const result = await estimateCallGas(client, MOCK_FROM, { to: MOCK_TO, value: 1000n })
    expect('gasEstimate' in result).toBe(true)
    if ('gasEstimate' in result) {
      expect(result.gasEstimate).toBe(21000n)
      expect(result.gasCostEth).toBe('0.000021')
    }
  })

  it('returns error on failure', async () => {
    const client = createMockClient({
      estimateGas: vi.fn().mockRejectedValue(new Error('cannot estimate')),
    } as unknown as Partial<PublicClient>)
    const result = await estimateCallGas(client, MOCK_FROM, { to: MOCK_TO, value: 1000n })
    expect('error' in result).toBe(true)
  })
})
