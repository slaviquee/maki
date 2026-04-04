import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkApproval, getApiQuote, getApiSwap, UniswapApiError } from './api-client.js'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
  }
}

const API_KEY = 'test-api-key'

describe('checkApproval', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns approval tx when approval is needed', async () => {
    const mockResponse = {
      requestId: 'req-1',
      approval: {
        to: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        from: '0xabc',
        data: '0x095ea7b3000000000000000000000000',
        value: '0',
        chainId: 84532,
      },
      cancel: null,
    }
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResponse))

    const result = await checkApproval(API_KEY, {
      walletAddress: '0xabc',
      token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      amount: '1000000',
      chainId: 84532,
    })

    expect(result.approval).not.toBeNull()
    expect(result.approval!.to).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e')
    expect(result.cancel).toBeNull()
  })

  it('returns null approval when already approved', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ requestId: 'req-2', approval: null, cancel: null }))

    const result = await checkApproval(API_KEY, {
      walletAddress: '0xabc',
      token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      amount: '1000000',
      chainId: 84532,
    })

    expect(result.approval).toBeNull()
  })

  it('sends correct headers including x-permit2-disabled', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ requestId: 'req-3', approval: null, cancel: null }))

    await checkApproval(API_KEY, {
      walletAddress: '0xabc',
      token: '0xtoken',
      amount: '1000',
      chainId: 84532,
    })

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['x-api-key']).toBe(API_KEY)
    expect(headers['x-permit2-disabled']).toBe('true')
    expect(headers['x-universal-router-version']).toBe('2.0')
  })
})

describe('getApiQuote', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns a classic quote for a V3 swap', async () => {
    const mockQuote = {
      requestId: 'req-q1',
      routing: 'CLASSIC',
      permitData: null,
      quote: {
        input: { token: '0x0000000000000000000000000000000000000000', amount: '10000000000000000' },
        output: { token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', amount: '25000000', recipient: '0xabc' },
        swapper: '0xabc',
        chainId: 84532,
        slippage: 0.5,
        tradeType: 'EXACT_INPUT',
        route: [[{ type: 'v3-pool', address: '0xpool' }]],
        gasFee: '50000000000000',
        gasFeeUSD: '0.12',
        gasUseEstimate: '150000',
        quoteId: 'quote-123',
        routeString: 'ETH -- 0.3% --> USDC',
        priceImpact: 0.01,
      },
    }
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockQuote))

    const result = await getApiQuote(API_KEY, {
      tokenIn: '0x0000000000000000000000000000000000000000',
      tokenOut: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      tokenInChainId: 84532,
      tokenOutChainId: 84532,
      type: 'EXACT_INPUT',
      amount: '10000000000000000',
      swapper: '0xabc',
      slippageTolerance: 0.5,
    })

    expect(result.routing).toBe('CLASSIC')
    expect(result.quote.output.amount).toBe('25000000')
    expect(result.quote.quoteId).toBe('quote-123')
  })

  it('forces V2/V3 protocols when none specified', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        requestId: 'req-q2',
        routing: 'CLASSIC',
        permitData: null,
        quote: {
          input: { token: '0x0', amount: '1' },
          output: { token: '0x1', amount: '1', recipient: '0xabc' },
          swapper: '0xabc',
          chainId: 84532,
          slippage: 0.5,
          tradeType: 'EXACT_INPUT',
          route: [],
          gasFee: '0',
          gasFeeUSD: '0',
          gasUseEstimate: '0',
          quoteId: 'q',
          routeString: '',
          priceImpact: 0,
        },
      }),
    )

    await getApiQuote(API_KEY, {
      tokenIn: '0x0',
      tokenOut: '0x1',
      tokenInChainId: 84532,
      tokenOutChainId: 84532,
      type: 'EXACT_INPUT',
      amount: '1',
      swapper: '0xabc',
    })

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string) as Record<string, unknown>
    expect(body['protocols']).toEqual(['V2', 'V3'])
  })

  it('rejects unsupported routing types', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        requestId: 'req-q3',
        routing: 'DUTCH_V2',
        permitData: null,
        quote: {
          input: { token: '0x0', amount: '1' },
          output: { token: '0x1', amount: '1', recipient: '0xabc' },
          swapper: '0xabc',
          chainId: 84532,
          slippage: 0.5,
          tradeType: 'EXACT_INPUT',
          route: [],
          gasFee: '0',
          gasFeeUSD: '0',
          gasUseEstimate: '0',
          quoteId: 'q',
          routeString: '',
          priceImpact: 0,
        },
      }),
    )

    await expect(
      getApiQuote(API_KEY, {
        tokenIn: '0x0',
        tokenOut: '0x1',
        tokenInChainId: 84532,
        tokenOutChainId: 84532,
        type: 'EXACT_INPUT',
        amount: '1',
        swapper: '0xabc',
      }),
    ).rejects.toThrow('Unsupported routing type')
  })

  it('throws UniswapApiError on API error response', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ errorCode: 'QuoteAmountTooLowError', detail: 'Amount too low for routing' }, 404),
    )

    await expect(
      getApiQuote(API_KEY, {
        tokenIn: '0x0',
        tokenOut: '0x1',
        tokenInChainId: 84532,
        tokenOutChainId: 84532,
        type: 'EXACT_INPUT',
        amount: '1',
        swapper: '0xabc',
      }),
    ).rejects.toThrow(UniswapApiError)
  })
})

describe('getApiSwap', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns unsigned swap transaction', async () => {
    const mockSwap = {
      requestId: 'req-s1',
      swap: {
        to: '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9',
        from: '0xabc',
        data: '0x24856bc3000000000000000000',
        value: '10000000000000000',
        chainId: 84532,
      },
      gasFee: '50000000000000',
    }
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockSwap))

    const result = await getApiSwap(API_KEY, {
      input: { token: '0x0', amount: '10000000000000000' },
      output: { token: '0x1', amount: '25000000', recipient: '0xabc' },
      swapper: '0xabc',
      chainId: 84532,
      slippage: 0.5,
      tradeType: 'EXACT_INPUT',
      route: [],
      gasFee: '50000000000000',
      gasFeeUSD: '0.12',
      gasUseEstimate: '150000',
      quoteId: 'q',
      routeString: '',
      priceImpact: 0,
    })

    expect(result.swap.to).toBe('0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9')
    expect(result.swap.data).toBeTruthy()
    expect(result.swap.value).toBe('10000000000000000')
  })
})
