import { type PublicClient, parseUnits, formatUnits } from 'viem'
import { quoterV2Abi } from './abis.js'
import { getUniswapAddresses } from './addresses.js'
import type { SupportedChainId } from '../../config/types.js'
import type { SwapQuoteParams, SwapQuote, UniswapFee } from './types.js'

const DEFAULT_FEES: UniswapFee[] = [500, 3000, 100, 10000]

/**
 * Gets a quote for an exact-in swap on Uniswap V3.
 * Tries multiple fee tiers and returns the best quote.
 */
export async function getSwapQuote(
  client: PublicClient,
  chainId: SupportedChainId,
  params: SwapQuoteParams,
): Promise<SwapQuote> {
  const addresses = getUniswapAddresses(chainId)
  const amountInRaw = parseUnits(params.amountIn, params.tokenIn.decimals)

  // If fee specified, only try that tier
  const feesToTry = params.fee ? [params.fee] : DEFAULT_FEES

  let bestQuote: SwapQuote | null = null

  for (const fee of feesToTry) {
    try {
      const result = await client.simulateContract({
        address: addresses.quoterV2,
        abi: quoterV2Abi,
        functionName: 'quoteExactInputSingle',
        args: [
          {
            tokenIn: params.tokenIn.address,
            tokenOut: params.tokenOut.address,
            amountIn: amountInRaw,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      })

      const [amountOutRaw, , , gasEstimate] = result.result
      const amountOut = formatUnits(amountOutRaw, params.tokenOut.decimals)

      const quote: SwapQuote = {
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountInRaw,
        amountOut,
        amountOutRaw,
        fee,
        gasEstimate,
      }

      // Keep the best quote (highest output)
      if (!bestQuote || amountOutRaw > bestQuote.amountOutRaw) {
        bestQuote = quote
      }
    } catch {
      // This fee tier doesn't have liquidity, try next
      continue
    }
  }

  if (!bestQuote) {
    throw new Error(
      `No liquidity found for ${params.tokenIn.symbol} → ${params.tokenOut.symbol} on any fee tier`,
    )
  }

  return bestQuote
}
