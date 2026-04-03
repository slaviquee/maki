import { type PublicClient, type Hex, formatEther } from 'viem'

export interface SimulationCall {
  to: `0x${string}`
  data?: Hex
  value?: bigint
}

export interface SimulationResult {
  success: boolean
  gasUsed?: bigint
  error?: string
  returnData?: Hex
}

/**
 * Simulates a call using eth_call to check if it would succeed.
 */
export async function simulateCall(
  client: PublicClient,
  from: `0x${string}`,
  call: SimulationCall,
): Promise<SimulationResult> {
  try {
    const result = await client.call({
      account: from,
      to: call.to,
      data: call.data,
      value: call.value,
    })

    return {
      success: true,
      returnData: result.data,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Simulation failed',
    }
  }
}

/**
 * Simulates multiple calls and returns results for each.
 */
export async function simulateCalls(
  client: PublicClient,
  from: `0x${string}`,
  calls: SimulationCall[],
): Promise<SimulationResult[]> {
  return Promise.all(calls.map((call) => simulateCall(client, from, call)))
}

/**
 * Estimates gas for a call.
 */
export async function estimateCallGas(
  client: PublicClient,
  from: `0x${string}`,
  call: SimulationCall,
): Promise<{ gasEstimate: bigint; gasCostEth: string } | { error: string }> {
  try {
    const gasEstimate = await client.estimateGas({
      account: from,
      to: call.to,
      data: call.data,
      value: call.value,
    })

    const gasPrice = await client.getGasPrice()
    const gasCostWei = gasEstimate * gasPrice
    const gasCostEth = formatEther(gasCostWei)

    return { gasEstimate, gasCostEth }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Gas estimation failed' }
  }
}
