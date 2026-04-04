import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { formatUnits } from 'viem'
import { getSwapQuote, buildSwapCalls } from '../adapters/uniswap/index.js'
import { findToken } from '../wallet-core/tokens.js'
import { executeWriteAction } from '../wallet-core/execute.js'
import { estimateUsdValue } from '../wallet-core/price-estimate.js'
import type { MakiContext } from './context.js'

export function registerSwapTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'quote_swap',
    label: 'Quote Swap',
    description: 'Get a quote for swapping one token for another on Uniswap. This is read-only — no approval needed.',
    promptSnippet: 'quote_swap: get a Uniswap swap quote (read-only)',
    promptGuidelines: [
      'Use this before build_swap to show the user what they would get.',
      'Tries multiple fee tiers and returns the best quote.',
      'Always show the quote to the user before executing.',
    ],
    parameters: Type.Object({
      tokenIn: Type.String({ description: 'Input token symbol (e.g. "ETH", "USDC")' }),
      tokenOut: Type.String({ description: 'Output token symbol (e.g. "USDC", "ETH")' }),
      amountIn: Type.String({ description: 'Amount of input token (e.g. "0.5" for 0.5 ETH)' }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()

      const tokenIn = findToken(maki.config.chainId, params.tokenIn)
      if (!tokenIn) throw new Error(`Token "${params.tokenIn}" not found in verified registry.`)

      const tokenOut = findToken(maki.config.chainId, params.tokenOut)
      if (!tokenOut) throw new Error(`Token "${params.tokenOut}" not found in verified registry.`)

      const quote = await getSwapQuote(maki.chainClient, maki.config.chainId, {
        tokenIn,
        tokenOut,
        amountIn: params.amountIn,
      })

      const lines = [
        `Swap Quote:`,
        `  ${quote.amountIn} ${quote.tokenIn.symbol} → ${quote.amountOut} ${quote.tokenOut.symbol}`,
        `  Fee tier: ${quote.fee / 10000}%`,
        `  Est. gas: ${quote.gasEstimate}`,
      ]

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: {
          tokenIn: quote.tokenIn.symbol,
          tokenOut: quote.tokenOut.symbol,
          amountIn: quote.amountIn,
          amountOut: quote.amountOut,
          fee: quote.fee,
        },
      }
    },
  })

  pi.registerTool({
    name: 'build_swap',
    label: 'Execute Swap',
    description:
      'Execute an exact-in token swap on Uniswap. Quotes, builds, simulates, checks policy, and requests approval.',
    promptSnippet: 'build_swap: execute a Uniswap swap (requires approval)',
    promptGuidelines: [
      'Always use quote_swap first to show the user the expected output.',
      'The user should confirm the quote before executing.',
      'Default slippage is 50bps (0.5%). The user can specify a different value.',
      'This goes through the full write pipeline: policy → simulate → approve.',
    ],
    parameters: Type.Object({
      tokenIn: Type.String({ description: 'Input token symbol (e.g. "ETH", "USDC")' }),
      tokenOut: Type.String({ description: 'Output token symbol (e.g. "USDC", "ETH")' }),
      amountIn: Type.String({ description: 'Amount of input token' }),
      slippageBps: Type.Optional(Type.Number({ description: 'Max slippage in basis points (default: 50 = 0.5%)' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const from = maki.config.smartAccountAddress
      if (!from) throw new Error('No smart account configured.')

      const tokenIn = findToken(maki.config.chainId, params.tokenIn)
      if (!tokenIn) throw new Error(`Token "${params.tokenIn}" not found in verified registry.`)

      const tokenOut = findToken(maki.config.chainId, params.tokenOut)
      if (!tokenOut) throw new Error(`Token "${params.tokenOut}" not found in verified registry.`)

      const slippageBps = params.slippageBps ?? 50

      // Get quote
      const quote = await getSwapQuote(maki.chainClient, maki.config.chainId, {
        tokenIn,
        tokenOut,
        amountIn: params.amountIn,
      })

      // Build calls
      const calls = buildSwapCalls(maki.config.chainId, {
        quote,
        recipient: from,
        slippageBps,
      })

      const description = `Swap ${quote.amountIn} ${tokenIn.symbol} for ~${quote.amountOut} ${tokenOut.symbol} (max slippage: ${slippageBps / 100}%)`

      // Execute through write pipeline
      const result = await executeWriteAction(
        {
          plan: {
            calls,
            description,
            actionClass: 2,
          },
          policyDetails: {
            type: 'swap',
            protocol: 'uniswap',
            token: tokenIn.symbol,
            amountUsd: estimateUsdValue(tokenIn.symbol, params.amountIn),
            slippageBps,
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
          content: [{ type: 'text' as const, text: `Swap blocked: ${result.error}\n\n${result.summary}` }],
          details: result,
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Swap approved:`,
              `  ${quote.amountIn} ${tokenIn.symbol} → ~${quote.amountOut} ${tokenOut.symbol}`,
              `  Min output: ${formatUnits(quote.amountOutRaw - (quote.amountOutRaw * BigInt(slippageBps)) / 10000n, tokenOut.decimals)} ${tokenOut.symbol}`,
              ``,
              result.summary,
              ``,
              `Note: On-chain submission requires bundler API key (Stage 5).`,
            ].join('\n'),
          },
        ],
        details: result,
      }
    },
  })
}
