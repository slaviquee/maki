import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { getBalances } from '../wallet-core/balances.js'
import { chainName } from '../wallet-core/chains.js'
import type { MakiContext } from './context.js'
import { getActiveAddress } from './context.js'

export function registerBalanceTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'get_balances',
    label: 'Get Balances',
    description: 'Get ETH and ERC-20 token balances for the wallet or a specified address.',
    promptSnippet: 'get_balances: read ETH and token balances',
    promptGuidelines: [
      'Use when the user asks about their balance, holdings, or portfolio.',
      'Returns balances for all known tokens with non-zero balances.',
    ],
    parameters: Type.Object({
      address: Type.Optional(Type.String({ description: 'Address to check. Defaults to the wallet address.' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const address = (params.address as `0x${string}` | undefined) ?? getActiveAddress(maki)
      if (!address) {
        throw new Error('No wallet address configured. Run setup first.')
      }

      const balances = await getBalances(maki.chainClient, address, maki.config.chainId)

      const lines = [
        `Balances for ${balances.address} on ${chainName(balances.chainId)}:`,
        `  ETH: ${balances.eth.formatted}`,
        ...balances.tokens.map((t) => `  ${t.token.symbol}: ${t.formatted}`),
      ]

      if (balances.tokens.length === 0) {
        lines.push('  No ERC-20 tokens with non-zero balance.')
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: {
          address: balances.address,
          chainId: balances.chainId,
          eth: balances.eth.formatted,
          tokens: balances.tokens.map((t) => ({ symbol: t.token.symbol, balance: t.formatted })),
        },
      }
    },
  })
}
