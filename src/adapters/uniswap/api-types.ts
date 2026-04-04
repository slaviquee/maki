/**
 * Typed request/response schemas for the Uniswap Trading API.
 *
 * Base URL: https://trade-api.gateway.uniswap.org/v1
 * Auth: x-api-key header
 *
 * Maki uses x-permit2-disabled: true on all calls because ERC-4337 smart
 * accounts cannot produce Permit2 EIP-712 signatures the way EOAs can.
 * This causes the API to return standard ERC-20 approve() txs and route
 * through the Proxy Universal Router instead.
 */

// ─── Shared ──────────────────────────────────────────────────────────────────

export interface ApiTransactionRequest {
  to: string
  from: string
  data: string
  value: string
  chainId: number
  gasLimit?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  gasPrice?: string
}

export interface ApiError {
  errorCode: string
  detail: string
}

// ─── /check_approval ─────────────────────────────────────────────────────────

export interface CheckApprovalRequest {
  walletAddress: string
  token: string
  amount: string
  chainId: number
  urgency?: 'normal' | 'fast' | 'urgent'
  includeGasInfo?: boolean
  tokenOut?: string
  tokenOutChainId?: number
}

export interface CheckApprovalResponse {
  requestId: string
  approval: ApiTransactionRequest | null
  cancel: ApiTransactionRequest | null
  gasFee?: string
  cancelGasFee?: string
}

// ─── /quote ──────────────────────────────────────────────────────────────────

export interface QuoteRequest {
  tokenIn: string
  tokenOut: string
  tokenInChainId: number
  tokenOutChainId: number
  type: 'EXACT_INPUT' | 'EXACT_OUTPUT'
  amount: string
  swapper: string
  slippageTolerance?: number
  autoSlippage?: 'DEFAULT'
  routingPreference?: 'BEST_PRICE' | 'FASTEST'
  protocols?: string[]
  urgency?: 'normal' | 'fast' | 'urgent'
}

export type RoutingType = 'CLASSIC' | 'WRAP' | 'UNWRAP' | 'DUTCH_V2' | 'DUTCH_V3' | 'PRIORITY' | 'BRIDGE'

export interface ClassicQuoteData {
  input: { token: string; amount: string }
  output: { token: string; amount: string; recipient: string }
  swapper: string
  chainId: number
  slippage: number
  tradeType: 'EXACT_INPUT' | 'EXACT_OUTPUT'
  route: unknown[][]
  gasFee: string
  gasFeeUSD: string
  gasUseEstimate: string
  quoteId: string
  routeString: string
  priceImpact: number
  blockNumber?: string
  portionBips?: number
  portionAmount?: string
  txFailureReasons?: string[]
}

export interface QuoteResponse {
  requestId: string
  quote: ClassicQuoteData
  routing: RoutingType
  permitData: unknown | null
}

// ─── /swap ───────────────────────────────────────────────────────────────────

/**
 * The /swap body must spread the quote response flat — the quote object
 * fields go at the top level, NOT wrapped in {quote: ...}.
 *
 * permitData: null must be stripped entirely (omit the field).
 */
export interface SwapRequest {
  quote: ClassicQuoteData
  simulateTransaction?: boolean
  refreshGasPrice?: boolean
  urgency?: 'normal' | 'fast' | 'urgent'
  deadline?: number
}

export interface SwapResponse {
  requestId: string
  swap: ApiTransactionRequest
  gasFee?: string
}
