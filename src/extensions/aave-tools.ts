import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { getAaveAccountSummary, getAaveAddresses, buildClaimAllRewards } from '../adapters/aave/index.js'
import { chainName } from '../wallet-core/chains.js'
import { executeWriteAction } from '../wallet-core/execute.js'
import type { MakiContext } from './context.js'

export function registerAaveTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'check_aave_position',
    label: 'Check Aave Position',
    description: 'Read Aave V3 position: collateral, debt, health factor, available borrows.',
    promptSnippet: 'check_aave_position: view Aave lending position (read-only)',
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const address = maki.config.smartAccountAddress
      if (!address) throw new Error('No smart account configured.')

      if (!getAaveAddresses(maki.config.chainId)) {
        return {
          content: [{ type: 'text' as const, text: `Aave is not available on ${chainName(maki.config.chainId)}. Aave V3 is only on Base mainnet.` }],
          details: { available: false },
        }
      }

      const summary = await getAaveAccountSummary(maki.chainClient, maki.config.chainId, address)
      if (!summary) {
        return {
          content: [{ type: 'text' as const, text: 'Could not fetch Aave position.' }],
          details: { error: 'fetch_failed' },
        }
      }

      const lines = [
        `Aave V3 Position on ${chainName(maki.config.chainId)}:`,
        `  Total collateral: $${summary.totalCollateralUsd}`,
        `  Total debt: $${summary.totalDebtUsd}`,
        `  Available to borrow: $${summary.availableBorrowsUsd}`,
        `  LTV: ${summary.ltv}`,
        `  Liquidation threshold: ${summary.liquidationThreshold}`,
        `  Health factor: ${summary.healthFactor}`,
      ]

      if (summary.totalCollateralUsd === '0') {
        lines.push('', 'No active Aave position.')
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: summary,
      }
    },
  })

  pi.registerTool({
    name: 'claim_aave_rewards',
    label: 'Claim Aave Rewards',
    description: 'Claim all pending Aave V3 rewards. This is a medium-risk write action.',
    promptSnippet: 'claim_aave_rewards: claim Aave reward tokens',
    parameters: Type.Object({
      aTokens: Type.Array(Type.String(), {
        description: 'List of aToken addresses to claim rewards for',
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const from = maki.config.smartAccountAddress
      if (!from) throw new Error('No smart account configured.')

      const call = buildClaimAllRewards(
        maki.config.chainId,
        params.aTokens as `0x${string}`[],
        from,
      )

      if (!call) {
        return {
          content: [{ type: 'text' as const, text: `Aave is not available on ${chainName(maki.config.chainId)}.` }],
          details: { available: false },
        }
      }

      const result = await executeWriteAction(
        {
          plan: {
            calls: [call],
            description: 'Claim all Aave V3 rewards',
            actionClass: 2,
          },
          policyDetails: {
            type: 'claim_rewards',
            protocol: 'aave',
          },
        },
        maki.chainClient,
        maki.signer,
        maki.policy,
        from,
      )

      if (result.status !== 'approved') {
        return {
          content: [{ type: 'text' as const, text: `Claim blocked: ${result.error}\n\n${result.summary}` }],
          details: result,
        }
      }

      return {
        content: [{ type: 'text' as const, text: `Aave reward claim approved.\n\n${result.summary}` }],
        details: result,
      }
    },
  })
}
