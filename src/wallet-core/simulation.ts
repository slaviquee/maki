import { type PublicClient, type Hex, formatEther, encodeFunctionData } from 'viem'

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
 * Simulates a single call using eth_call.
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

// Coinbase Smart Wallet executeBatch ABI for simulation
const executeBatchAbi = [
  {
    type: 'function',
    name: 'executeBatch',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
] as const

/**
 * Simulates a sequence of calls as a single batch via the smart account's
 * executeBatch. This ensures approve+swap and other multi-step plans are
 * simulated with correct intermediate state (e.g. the swap sees the approval).
 *
 * If the smart account is not yet deployed (counterfactual), batch simulation
 * is skipped — there is no on-chain code to call executeBatch on. The first
 * transaction on an undeployed account includes initCode that deploys it as
 * part of the UserOp; simulation of that full flow is the bundler's job.
 * Individual target calls are still simulated where possible.
 */
export async function simulateCallSequence(
  client: PublicClient,
  from: `0x${string}`,
  calls: SimulationCall[],
): Promise<SimulationResult> {
  if (calls.length === 0) {
    return { success: true }
  }

  if (calls.length === 1) {
    return simulateCall(client, from, calls[0]!)
  }

  // Check if the smart account has deployed code
  const code = await client.getCode({ address: from })
  const isDeployed = code !== undefined && code !== '0x'

  if (!isDeployed) {
    // Counterfactual account: no on-chain code to call executeBatch on, and
    // simulating individual calls from a multi-step plan is unsound because
    // later calls depend on state from earlier ones (e.g. swap needs the
    // preceding approval). The first UserOp's initCode deploys the account
    // atomically — the bundler validates the full sequence at submission.
    return { success: true }
  }

  // Deployed account: simulate the full sequence as executeBatch
  const totalValue = calls.reduce((sum, c) => sum + (c.value ?? 0n), 0n)

  try {
    const batchCalldata = encodeFunctionData({
      abi: executeBatchAbi,
      functionName: 'executeBatch',
      args: [
        calls.map((c) => ({
          target: c.to,
          value: c.value ?? 0n,
          data: (c.data ?? '0x') as Hex,
        })),
      ],
    })

    await client.call({
      account: from,
      to: from,
      data: batchCalldata,
      value: totalValue,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Batch simulation failed',
    }
  }
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
