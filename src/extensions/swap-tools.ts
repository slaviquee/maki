import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { formatUnits } from 'viem'
import { getSwapQuote, buildSwapCalls } from '../adapters/uniswap/index.js'
import { getApiSwapQuote, buildApiSwapCalls } from '../adapters/uniswap/index.js'
import { findToken } from '../wallet-core/tokens.js'
import { executeWriteAction } from '../wallet-core/execute.js'
import { getUsdcSpendingCapAmount } from '../wallet-core/spending-cap.js'
import { submitApproved } from './submit-helper.js'
import type { MakiContext } from './context.js'
import { getActiveAddress } from './context.js'
import type { UserOpCall } from '../wallet-core/userop.js'

export function ensureSwapSupportedInAccountMode(accountMode: MakiContext['accountMode'], calls: UserOpCall[]): void {
  if (accountMode !== 'eoa-demo') return

  if (calls.length !== 1) {
    throw new Error(
      `Ledger EOA demo mode supports single-call swaps only (got ${calls.length} calls). ` +
        `This swap route needs batched approval or multiple on-chain steps, so use the smart-account flow instead.`,
    )
  }
}

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
      'If the user already provided amount + input token + output token, do not ask them to repeat it — call this tool directly.',
      'If the user asks to swap ETH to USDC with an exact amount, treat that as sufficient to quote immediately.',
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

      // Use Uniswap Trading API when configured, fall back to on-chain Quoter V2
      if (maki.config.uniswapApiKey) {
        const swapper = getActiveAddress(maki) ?? ('0x0000000000000000000000000000000000000000' as `0x${string}`)
        const apiQuote = await getApiSwapQuote(maki.config.uniswapApiKey, maki.config.chainId, swapper, {
          tokenIn,
          tokenOut,
          amountIn: params.amountIn,
        })

        const lines = [
          `Swap Quote (Uniswap API):`,
          `  ${apiQuote.amountIn} ${apiQuote.tokenIn.symbol} → ${apiQuote.amountOut} ${apiQuote.tokenOut.symbol}`,
          `  Route: ${apiQuote.routing} — ${apiQuote.routeString}`,
          `  Price impact: ${apiQuote.priceImpact}%`,
          `  Est. gas: $${apiQuote.gasFeeUSD}`,
        ]

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
          details: {
            tokenIn: apiQuote.tokenIn.symbol,
            tokenOut: apiQuote.tokenOut.symbol,
            amountIn: apiQuote.amountIn,
            amountOut: apiQuote.amountOut,
            routing: apiQuote.routing,
            priceImpact: apiQuote.priceImpact,
            source: 'uniswap-api',
          },
        }
      }

      if (maki.config.chainId === 11155111) {
        throw new Error('Ethereum Sepolia swaps require `uniswapApiKey`; the local Uniswap fallback is not configured.')
      }

      // Fallback: on-chain Quoter V2
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
          source: 'on-chain',
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
      'This goes through the full write pipeline: policy → simulate → approve → submit.',
      'Ledger EOA demo mode supports only single-call swap routes. Multi-call routes must use the smart-account flow.',
      'If the user already provided a complete exact-in swap request, do not ask for the amount again.',
      'Only ask follow-up questions when the amount, token pair, or chain is genuinely ambiguous.',
    ],
    parameters: Type.Object({
      tokenIn: Type.String({ description: 'Input token symbol (e.g. "ETH", "USDC")' }),
      tokenOut: Type.String({ description: 'Output token symbol (e.g. "USDC", "ETH")' }),
      amountIn: Type.String({ description: 'Amount of input token' }),
      slippageBps: Type.Optional(Type.Number({ description: 'Max slippage in basis points (default: 50 = 0.5%)' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()

      const from = getActiveAddress(maki)
      if (!from) throw new Error('No account configured.')

      const tokenIn = findToken(maki.config.chainId, params.tokenIn)
      if (!tokenIn) throw new Error(`Token "${params.tokenIn}" not found in verified registry.`)

      const tokenOut = findToken(maki.config.chainId, params.tokenOut)
      if (!tokenOut) throw new Error(`Token "${params.tokenOut}" not found in verified registry.`)

      const slippageBps = params.slippageBps ?? 50
      const amountUsdc = getUsdcSpendingCapAmount(tokenIn.symbol, params.amountIn)

      let calls: import('../wallet-core/userop.js').UserOpCall[]
      let amountOut: string
      let amountOutMin: string
      let swapSource: string

      // Use Uniswap Trading API when configured, fall back to on-chain
      if (maki.config.uniswapApiKey) {
        const apiResult = await buildApiSwapCalls(maki.config.uniswapApiKey, maki.config.chainId, from, {
          tokenIn,
          tokenOut,
          amountIn: params.amountIn,
          slippageBps,
        })
        calls = apiResult.calls
        amountOut = apiResult.quote.amountOut
        amountOutMin = formatUnits(apiResult.quote.amountOutMinimum, tokenOut.decimals)
        swapSource = `Uniswap API (${apiResult.quote.routing})`
      } else {
        if (maki.config.chainId === 11155111) {
          throw new Error(
            'Ethereum Sepolia swaps require `uniswapApiKey`; the local Uniswap fallback is not configured.',
          )
        }

        // Fallback: on-chain Quoter V2 + local calldata construction
        const quote = await getSwapQuote(maki.chainClient, maki.config.chainId, {
          tokenIn,
          tokenOut,
          amountIn: params.amountIn,
        })
        calls = buildSwapCalls(maki.config.chainId, {
          quote,
          recipient: from,
          slippageBps,
        })
        amountOut = quote.amountOut
        amountOutMin = formatUnits(
          quote.amountOutRaw - (quote.amountOutRaw * BigInt(slippageBps)) / 10000n,
          tokenOut.decimals,
        )
        swapSource = 'on-chain'
      }

      const description = `Swap ${params.amountIn} ${tokenIn.symbol} for ~${amountOut} ${tokenOut.symbol} (max slippage: ${slippageBps / 100}%) via ${swapSource}`

      ensureSwapSupportedInAccountMode(maki.accountMode, calls)

      let result = await executeWriteAction(
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
            amountUsdc,
            slippageBps,
          },
        },
        maki.chainClient,
        maki.policy,
        from,
        maki.spending,
        maki.auditLog,
      )

      if (result.status === 'approved') {
        result = await submitApproved(maki, calls, result)
      }

      if (result.status === 'confirmed') {
        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Swap confirmed on-chain.`,
                `  ${params.amountIn} ${tokenIn.symbol} → ~${amountOut} ${tokenOut.symbol}`,
                `  Min output: ${amountOutMin} ${tokenOut.symbol}`,
                `  Tx: ${result.txHash}`,
                '',
                result.summary,
              ].join('\n'),
            },
          ],
          details: result,
        }
      }

      if (result.status === 'approved') {
        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Swap approved.`,
                `  ${params.amountIn} ${tokenIn.symbol} → ~${amountOut} ${tokenOut.symbol}`,
                result.error ?? '',
                '',
                result.summary,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          details: result,
        }
      }

      return {
        content: [{ type: 'text' as const, text: `Swap blocked: ${result.error}\n\n${result.summary}` }],
        details: result,
      }
    },
  })
}
