import type { TokenInfo } from '../../wallet-core/types.js'

export type UniswapFee = 100 | 500 | 3000 | 10000

export interface SwapQuoteParams {
  tokenIn: TokenInfo
  tokenOut: TokenInfo
  amountIn: string // human-readable
  fee?: UniswapFee
}

export interface SwapQuote {
  tokenIn: TokenInfo
  tokenOut: TokenInfo
  amountIn: string
  amountInRaw: bigint
  amountOut: string
  amountOutRaw: bigint
  fee: UniswapFee
  priceImpact?: string
  gasEstimate: bigint
}

export interface SwapBuildParams {
  quote: SwapQuote
  recipient: `0x${string}`
  slippageBps: number // e.g. 50 = 0.5%
}
