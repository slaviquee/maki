import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { getAllowances, getKnownSpenders } from '../wallet-core/allowances.js'
import { getTokenRegistry } from '../wallet-core/tokens.js'
import type { MakiContext } from './context.js'

export function registerAllowanceTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'get_allowances',
    label: 'Get Allowances',
    description: 'Check ERC-20 token allowances. Shows which protocols have approval to spend tokens.',
    promptSnippet: 'get_allowances: check token approvals for known protocols',
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const address = maki.config.smartAccountAddress
      if (!address) {
        throw new Error('No wallet address configured.')
      }

      const tokens = getTokenRegistry(maki.config.chainId)
      const spenders = getKnownSpenders(maki.config.chainId)
      const allowances = await getAllowances(maki.chainClient, address, tokens, spenders)

      if (allowances.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No active token allowances found.' }],
          details: { allowances: [] },
        }
      }

      const lines = allowances.map(
        (a) => `${a.token.symbol} => ${a.spenderLabel ?? a.spender}: ${a.isUnlimited ? 'UNLIMITED' : a.formatted}`,
      )

      return {
        content: [{ type: 'text' as const, text: `Active allowances:\n${lines.join('\n')}` }],
        details: {
          allowances: allowances.map((a) => ({
            token: a.token.symbol,
            spender: a.spenderLabel ?? a.spender,
            amount: a.formatted,
            unlimited: a.isUnlimited,
          })),
        },
      }
    },
  })
}
