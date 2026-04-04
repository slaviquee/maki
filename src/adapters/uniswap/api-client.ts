/**
 * Typed HTTP client for the Uniswap Trading API.
 *
 * All calls use x-permit2-disabled: true because Maki's ERC-4337 smart
 * accounts cannot produce Permit2 EIP-712 signatures. This causes the API
 * to return standard ERC-20 approve() transactions and route through the
 * Proxy Universal Router.
 *
 * Only CLASSIC, WRAP, and UNWRAP routing types are supported in phase 1.
 * UniswapX (Dutch auction) support is intentionally deferred.
 */

import type {
  CheckApprovalRequest,
  CheckApprovalResponse,
  QuoteRequest,
  QuoteResponse,
  SwapResponse,
  ApiError,
  ClassicQuoteData,
} from './api-types.js'

const BASE_URL = 'https://trade-api.gateway.uniswap.org/v1'

const SUPPORTED_ROUTING_TYPES = new Set(['CLASSIC', 'WRAP', 'UNWRAP'])

export class UniswapApiError extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly detail: string,
    public readonly statusCode: number,
  ) {
    super(`Uniswap API error [${errorCode}]: ${detail}`)
    this.name = 'UniswapApiError'
  }
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-universal-router-version': '2.0',
    'x-permit2-disabled': 'true',
  }
}

async function apiRequest<T>(apiKey: string, endpoint: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${endpoint}`
  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let errorCode = 'UnknownError'
    let detail = `HTTP ${response.status}`
    try {
      const err = (await response.json()) as ApiError
      errorCode = err.errorCode ?? errorCode
      detail = err.detail ?? detail
    } catch {
      // Could not parse error body
    }
    throw new UniswapApiError(errorCode, detail, response.status)
  }

  return (await response.json()) as T
}

/**
 * Checks whether an ERC-20 approval is needed before swapping.
 * Returns null for the approval field if the token is already approved.
 */
export async function checkApproval(apiKey: string, params: CheckApprovalRequest): Promise<CheckApprovalResponse> {
  return apiRequest<CheckApprovalResponse>(apiKey, '/check_approval', params)
}

/**
 * Gets a swap quote from the Uniswap Trading API.
 *
 * Forces classic routing across V2/V3 pools — no UniswapX or V4 in phase 1.
 * Validates that the returned routing type is supported.
 */
export async function getApiQuote(apiKey: string, params: QuoteRequest): Promise<QuoteResponse> {
  const requestBody: QuoteRequest = {
    ...params,
    // Restrict to V2/V3 for phase 1 so Maki can fully decode and validate
    // the Universal Router calldata before signing.
    protocols: params.protocols ?? ['V2', 'V3'],
  }

  const response = await apiRequest<QuoteResponse>(apiKey, '/quote', requestBody)

  if (!SUPPORTED_ROUTING_TYPES.has(response.routing)) {
    throw new Error(
      `Unsupported routing type "${response.routing}" returned by Uniswap API. ` +
        `Phase 1 supports: ${[...SUPPORTED_ROUTING_TYPES].join(', ')}`,
    )
  }

  return response
}

/**
 * Builds an unsigned swap transaction from a quote.
 *
 * The /swap body spreads the quote flat at the top level.
 * permitData: null is stripped (omitted entirely).
 */
export async function getApiSwap(
  apiKey: string,
  quote: ClassicQuoteData,
  options?: {
    simulateTransaction?: boolean
    deadline?: number
  },
): Promise<SwapResponse> {
  const body: Record<string, unknown> = {
    quote,
    simulateTransaction: options?.simulateTransaction ?? false,
    urgency: 'urgent',
  }

  if (options?.deadline !== undefined) {
    body['deadline'] = options.deadline
  }

  return apiRequest<SwapResponse>(apiKey, '/swap', body)
}
