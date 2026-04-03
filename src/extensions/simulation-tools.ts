import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { simulateCall, estimateCallGas } from '../wallet-core/simulation.js'
import type { Hex } from 'viem'
import type { MakiContext } from './context.js'

export function registerSimulationTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'simulate_call',
    label: 'Simulate Call',
    description: 'Simulate a contract call to check if it would succeed, without executing it on-chain.',
    promptSnippet: 'simulate_call: dry-run a transaction to predict success or failure',
    parameters: Type.Object({
      to: Type.String({ description: 'Target contract address' }),
      data: Type.Optional(Type.String({ description: 'Calldata (hex)' })),
      value: Type.Optional(Type.String({ description: 'ETH value in wei (as string)' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const from = maki.config.smartAccountAddress
      if (!from) throw new Error('No smart account configured.')

      const result = await simulateCall(maki.chainClient, from, {
        to: params.to as `0x${string}`,
        data: params.data as Hex | undefined,
        value: params.value ? BigInt(params.value) : undefined,
      })

      const text = result.success
        ? `Simulation succeeded${result.returnData ? ` (return: ${result.returnData.slice(0, 20)}...)` : ''}`
        : `Simulation failed: ${result.error}`

      return {
        content: [{ type: 'text' as const, text }],
        details: result,
      }
    },
  })

  pi.registerTool({
    name: 'estimate_gas',
    label: 'Estimate Gas',
    description: 'Estimate gas cost for a transaction.',
    promptSnippet: 'estimate_gas: estimate gas cost in ETH for a transaction',
    parameters: Type.Object({
      to: Type.String({ description: 'Target address' }),
      data: Type.Optional(Type.String({ description: 'Calldata (hex)' })),
      value: Type.Optional(Type.String({ description: 'ETH value in wei (as string)' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const from = maki.config.smartAccountAddress
      if (!from) throw new Error('No smart account configured.')

      const result = await estimateCallGas(maki.chainClient, from, {
        to: params.to as `0x${string}`,
        data: params.data as Hex | undefined,
        value: params.value ? BigInt(params.value) : undefined,
      })

      if ('error' in result) {
        return {
          content: [{ type: 'text' as const, text: `Gas estimation failed: ${result.error}` }],
          details: result,
        }
      }

      return {
        content: [{ type: 'text' as const, text: `Gas estimate: ${result.gasEstimate} gas (~${result.gasCostEth} ETH)` }],
        details: { gasEstimate: result.gasEstimate.toString(), gasCostEth: result.gasCostEth },
      }
    },
  })
}
