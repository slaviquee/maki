import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { buildRevokeApproval } from '../adapters/erc20/index.js'
import { findToken } from '../wallet-core/tokens.js'
import { executeWriteAction } from '../wallet-core/execute.js'
import type { MakiContext } from './context.js'

export function registerRevokeTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'revoke_approval',
    label: 'Revoke Approval',
    description: 'Revoke (set to 0) an ERC-20 token approval for a spender. This is a low-risk write action.',
    promptSnippet: 'revoke_approval: revoke a token approval for a spender',
    promptGuidelines: [
      'Use get_allowances first to show current approvals.',
      'Revoking sets the allowance to 0.',
      'This is a low-risk write (action class 1).',
    ],
    parameters: Type.Object({
      token: Type.String({ description: 'Token symbol (e.g. "USDC") or contract address' }),
      spender: Type.String({ description: 'Spender address to revoke approval for' }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const from = maki.config.smartAccountAddress
      if (!from) throw new Error('No smart account configured.')

      const tokenInfo = findToken(maki.config.chainId, params.token)
      if (!tokenInfo) {
        throw new Error(`Token "${params.token}" not found in verified registry.`)
      }

      const spender = params.spender as `0x${string}`
      const call = buildRevokeApproval(tokenInfo, spender)

      const result = await executeWriteAction(
        {
          plan: {
            calls: [call],
            description: `Revoke ${tokenInfo.symbol} approval for ${spender}`,
            actionClass: 1,
          },
          policyDetails: {
            type: 'revoke_approval',
            token: tokenInfo.symbol,
            protocol: spender,
          },
        },
        maki.chainClient,
        maki.signer,
        maki.policy,
        from,
        maki.spending,
        maki.auditLog,
      )

      if (result.status !== 'approved') {
        return {
          content: [{ type: 'text' as const, text: `Revoke blocked: ${result.error}\n\n${result.summary}` }],
          details: result,
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Revoke approved and ready to submit.\n\n${result.summary}\n\nNote: Actual on-chain submission requires a bundler API key (Stage 5).`,
          },
        ],
        details: result,
      }
    },
  })
}
