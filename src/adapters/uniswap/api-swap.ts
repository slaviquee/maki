/**
 * API-backed swap module that uses the Uniswap Trading API for routing
 * and transaction generation, then adapts the results into Maki's
 * UserOpCall format for the existing safety pipeline.
 *
 * Flow:
 *   1. /quote — get optimized route and pricing
 *   2. /check_approval — check if ERC-20 approval is needed
 *   3. /swap — get unsigned transaction
 *   4. Validate all API responses against resolved intent
 *   5. Adapt into UserOpCall[] for simulate → policy → approve → sign → submit
 */

import { parseUnits, formatUnits, type Hex } from 'viem'
import { checkApproval, getApiQuote, getApiSwap } from './api-client.js'
import { validateQuoteIntent, validateSwapTransaction, validateApprovalTransaction } from './api-validation.js'
import type { RoutingType } from './api-types.js'
import type { SupportedChainId } from '../../config/types.js'
import type { TokenInfo } from '../../wallet-core/types.js'
import type { UserOpCall } from '../../wallet-core/userop.js'

/** Native ETH is represented as the zero address in the Uniswap API */
const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000'

export interface ApiSwapQuoteParams {
  tokenIn: TokenInfo
  tokenOut: TokenInfo
  amountIn: string
  slippageBps?: number
}

export interface ApiSwapQuote {
  tokenIn: TokenInfo
  tokenOut: TokenInfo
  amountIn: string
  amountInRaw: bigint
  amountOut: string
  amountOutRaw: bigint
  amountOutMinimum: bigint
  gasFeeUSD: string
  gasUseEstimate: string
  priceImpact: number
  routing: RoutingType
  routeString: string
  quoteId: string
  /** The raw API quote data needed for /swap */
  _apiQuote: unknown
}

/**
 * Returns the API token address for a TokenInfo.
 * ETH (native) maps to the zero address; ERC-20s use their contract address.
 */
function apiTokenAddress(token: TokenInfo): string {
  if (token.symbol === 'ETH') {
    return NATIVE_TOKEN_ADDRESS
  }
  return token.address
}

/**
 * Gets an optimized swap quote from the Uniswap Trading API.
 */
export async function getApiSwapQuote(
  apiKey: string,
  chainId: SupportedChainId,
  swapper: `0x${string}`,
  params: ApiSwapQuoteParams,
): Promise<ApiSwapQuote> {
  const amountInRaw = parseUnits(params.amountIn, params.tokenIn.decimals)
  const slippage = params.slippageBps !== undefined ? params.slippageBps / 100 : 0.5

  const response = await getApiQuote(apiKey, {
    tokenIn: apiTokenAddress(params.tokenIn),
    tokenOut: apiTokenAddress(params.tokenOut),
    tokenInChainId: chainId,
    tokenOutChainId: chainId,
    type: 'EXACT_INPUT',
    amount: amountInRaw.toString(),
    swapper,
    slippageTolerance: slippage,
    routingPreference: 'BEST_PRICE',
  })

  // Validate quote matches resolved intent
  const intentValidation = validateQuoteIntent(
    response,
    apiTokenAddress(params.tokenIn),
    apiTokenAddress(params.tokenOut),
    chainId,
    {
      expectedAmountIn: amountInRaw,
      expectedRecipient: swapper,
      expectedSwapper: swapper,
    },
  )
  if (!intentValidation.valid) {
    throw new Error(`Quote validation failed: ${intentValidation.errors.join('; ')}`)
  }

  const amountOutRaw = BigInt(response.quote.output.amount)
  const amountOut = formatUnits(amountOutRaw, params.tokenOut.decimals)

  // Calculate minimum output with slippage
  const slippageBps = params.slippageBps ?? 50
  const amountOutMinimum = amountOutRaw - (amountOutRaw * BigInt(slippageBps)) / 10000n

  return {
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    amountInRaw,
    amountOut,
    amountOutRaw,
    amountOutMinimum,
    gasFeeUSD: response.quote.gasFeeUSD,
    gasUseEstimate: response.quote.gasUseEstimate,
    priceImpact: response.quote.priceImpact,
    routing: response.routing,
    routeString: response.quote.routeString,
    quoteId: response.quote.quoteId,
    _apiQuote: response.quote,
  }
}

/**
 * Builds UserOpCall[] from the Uniswap Trading API for an exact-in swap.
 *
 * Steps:
 *   1. Get fresh quote from /quote
 *   2. Check if approval is needed via /check_approval
 *   3. Get unsigned swap tx via /swap
 *   4. Validate all transaction targets and data
 *   5. Return [approval?, swap] as UserOpCall[]
 */
export async function buildApiSwapCalls(
  apiKey: string,
  chainId: SupportedChainId,
  swapper: `0x${string}`,
  params: ApiSwapQuoteParams,
): Promise<{ calls: UserOpCall[]; quote: ApiSwapQuote }> {
  // 1. Get fresh quote
  const quote = await getApiSwapQuote(apiKey, chainId, swapper, params)

  const calls: UserOpCall[] = []
  const isNativeIn = params.tokenIn.symbol === 'ETH'

  // 2. Check approval for ERC-20 input tokens
  if (!isNativeIn) {
    const approvalResponse = await checkApproval(apiKey, {
      walletAddress: swapper,
      token: params.tokenIn.address,
      amount: quote.amountInRaw.toString(),
      chainId,
      tokenOut: apiTokenAddress(params.tokenOut),
      tokenOutChainId: chainId,
    })

    // If cancel is needed (reset approval to 0 first), add it
    // Cancel sets approval to 0, so expectedMaxAmount is 0n
    if (approvalResponse.cancel) {
      const cancelValidation = validateApprovalTransaction(approvalResponse.cancel, params.tokenIn.address, chainId, 0n)
      if (!cancelValidation.valid) {
        throw new Error(`Cancel approval validation failed: ${cancelValidation.errors.join('; ')}`)
      }
      calls.push({
        to: approvalResponse.cancel.to as `0x${string}`,
        data: approvalResponse.cancel.data as Hex,
        value: BigInt(approvalResponse.cancel.value || '0'),
      })
    }

    // If approval is needed, validate spender + amount
    if (approvalResponse.approval) {
      const approvalValidation = validateApprovalTransaction(
        approvalResponse.approval,
        params.tokenIn.address,
        chainId,
        quote.amountInRaw,
      )
      if (!approvalValidation.valid) {
        throw new Error(`Approval validation failed: ${approvalValidation.errors.join('; ')}`)
      }
      calls.push({
        to: approvalResponse.approval.to as `0x${string}`,
        data: approvalResponse.approval.data as Hex,
        value: BigInt(approvalResponse.approval.value || '0'),
      })
    }
  }

  // 3. Get unsigned swap transaction
  const swapResponse = await getApiSwap(apiKey, quote._apiQuote as Parameters<typeof getApiSwap>[1])

  // 4. Validate swap transaction with semantic checks
  const swapValidation = validateSwapTransaction(swapResponse.swap, chainId, {
    expectedSwapper: swapper,
    expectedRecipient: swapper,
    expectedTokenIn: apiTokenAddress(params.tokenIn),
    expectedTokenOut: apiTokenAddress(params.tokenOut),
    expectedAmountIn: quote.amountInRaw,
    expectedAmountOutMinimum: quote.amountOutMinimum,
    expectedValue: isNativeIn ? quote.amountInRaw : undefined,
    isNativeIn,
    expectedRouting: quote.routing,
  })
  if (!swapValidation.valid) {
    throw new Error(`Swap transaction validation failed: ${swapValidation.errors.join('; ')}`)
  }

  // 5. Adapt into UserOpCall
  calls.push({
    to: swapResponse.swap.to as `0x${string}`,
    data: swapResponse.swap.data as Hex,
    value: BigInt(swapResponse.swap.value || '0'),
  })

  return { calls, quote }
}
