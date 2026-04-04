import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, encodeFunctionData, parseAbiParameters, type Hex } from 'viem'
import { erc20Abi } from '../../wallet-core/erc20-abi.js'
import { buildApiSwapCalls, getApiSwapQuote } from './api-swap.js'
import type { TokenInfo } from '../../wallet-core/types.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const API_KEY = 'test-api-key'
const SWAPPER = '0xabc1234567890abcdef1234567890abcdef123456' as `0x${string}`

const USDC_SEPOLIA: TokenInfo = {
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  chainId: 84532,
}

const ETH_TOKEN: TokenInfo = {
  symbol: 'ETH',
  name: 'Ether',
  decimals: 18,
  address: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  chainId: 84532,
}

const NATIVE_ZERO = '0x0000000000000000000000000000000000000000'
const WETH = '0x4200000000000000000000000000000000000006'
const PROXY_ROUTER = '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9'
const MSG_SENDER = '0x0000000000000000000000000000000000000001'
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002'
const EVIL = '0x1111111111111111111111111111111111111111'
const V3_SWAP_EXACT_IN = 0x00
const SWEEP = 0x04
const WRAP_ETH = 0x0b
const UNWRAP_WETH = 0x0c

const universalRouterExecuteAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

function encodeApprove(spender: string, amount: bigint): string {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender as `0x${string}`, amount],
  })
}

function encodeV3Path(tokenIn: string, fee: number, tokenOut: string): Hex {
  return `0x${tokenIn.slice(2)}${fee.toString(16).padStart(6, '0')}${tokenOut.slice(2)}` as Hex
}

function encodeV3SwapExactInInput(args: {
  recipient: string
  amountIn: bigint
  amountOutMin: bigint
  path: Hex
  payerIsUser?: boolean
}): Hex {
  return encodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser'),
    [args.recipient as `0x${string}`, args.amountIn, args.amountOutMin, args.path, args.payerIsUser ?? false],
  )
}

function encodeWrapEthInput(recipient: string, amount: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters('address recipient, uint256 amount'), [
    recipient as `0x${string}`,
    amount,
  ])
}

function encodeUnwrapWethInput(recipient: string, amountMinimum: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters('address recipient, uint256 amountMinimum'), [
    recipient as `0x${string}`,
    amountMinimum,
  ])
}

function encodeSweepInput(token: string, recipient: string, amountMinimum: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters('address token, address recipient, uint256 amountMinimum'), [
    token as `0x${string}`,
    recipient as `0x${string}`,
    amountMinimum,
  ])
}

function encodeExecute(commands: number[], inputs: Hex[]): Hex {
  const commandsHex = `0x${commands.map((command) => command.toString(16).padStart(2, '0')).join('')}` as Hex
  return encodeFunctionData({
    abi: universalRouterExecuteAbi,
    functionName: 'execute',
    args: [commandsHex, inputs, 9999999999n],
  })
}

function mockQuoteResponse(params?: {
  routing?: 'CLASSIC' | 'WRAP' | 'UNWRAP'
  tokenIn?: string
  tokenOut?: string
  amountIn?: string
  amountOut?: string
  recipient?: string
}) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      requestId: 'req-q',
      routing: params?.routing ?? 'CLASSIC',
      permitData: null,
      quote: {
        input: { token: params?.tokenIn ?? NATIVE_ZERO, amount: params?.amountIn ?? '10000000000000000' },
        output: {
          token: params?.tokenOut ?? USDC_SEPOLIA.address,
          amount: params?.amountOut ?? '25000000',
          recipient: params?.recipient ?? SWAPPER,
        },
        swapper: SWAPPER,
        chainId: 84532,
        slippage: 0.5,
        tradeType: 'EXACT_INPUT',
        route: [[{ type: 'v3-pool', address: '0xpool' }]],
        gasFee: '50000000000000',
        gasFeeUSD: '0.12',
        gasUseEstimate: '150000',
        quoteId: 'quote-123',
        routeString: 'route',
        priceImpact: 0.01,
      },
    }),
  }
}

function mockApprovalResponse(needsApproval: boolean, amount = 25000000n, spender = PROXY_ROUTER) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      requestId: 'req-a',
      approval: needsApproval
        ? {
            to: USDC_SEPOLIA.address,
            from: SWAPPER,
            data: encodeApprove(spender, amount),
            value: '0',
            chainId: 84532,
          }
        : null,
      cancel: null,
    }),
  }
}

function mockSwapResponse(data: Hex, value = '10000000000000000') {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      requestId: 'req-s',
      swap: {
        to: PROXY_ROUTER,
        from: SWAPPER,
        data,
        value,
        chainId: 84532,
      },
      gasFee: '50000000000000',
    }),
  }
}

afterEach(() => vi.clearAllMocks())

describe('getApiSwapQuote', () => {
  it('returns parsed quote with correct amounts', async () => {
    mockFetch.mockResolvedValueOnce(mockQuoteResponse())

    const quote = await getApiSwapQuote(API_KEY, 84532, SWAPPER, {
      tokenIn: ETH_TOKEN,
      tokenOut: USDC_SEPOLIA,
      amountIn: '0.01',
    })

    expect(quote.amountInRaw).toBe(10000000000000000n)
    expect(quote.amountOutRaw).toBe(25000000n)
    expect(quote.quoteId).toBe('quote-123')
  })

  it('rejects quote recipient mismatch', async () => {
    mockFetch.mockResolvedValueOnce(mockQuoteResponse({ recipient: EVIL }))

    await expect(
      getApiSwapQuote(API_KEY, 84532, SWAPPER, {
        tokenIn: ETH_TOKEN,
        tokenOut: USDC_SEPOLIA,
        amountIn: '0.01',
      }),
    ).rejects.toThrow('Quote validation failed')
  })
})

describe('buildApiSwapCalls', () => {
  it('builds calls for native ETH swap (no approval needed)', async () => {
    mockFetch.mockResolvedValueOnce(mockQuoteResponse())
    mockFetch.mockResolvedValueOnce(
      mockSwapResponse(
        encodeExecute(
          [WRAP_ETH, V3_SWAP_EXACT_IN, SWEEP],
          [
            encodeWrapEthInput(ADDRESS_THIS, 10000000000000000n),
            encodeV3SwapExactInInput({
              recipient: ADDRESS_THIS,
              amountIn: 10000000000000000n,
              amountOutMin: 24875000n,
              path: encodeV3Path(WETH, 3000, USDC_SEPOLIA.address),
            }),
            encodeSweepInput(USDC_SEPOLIA.address, MSG_SENDER, 24875000n),
          ],
        ),
      ),
    )

    const { calls } = await buildApiSwapCalls(API_KEY, 84532, SWAPPER, {
      tokenIn: ETH_TOKEN,
      tokenOut: USDC_SEPOLIA,
      amountIn: '0.01',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.to.toLowerCase()).toBe(PROXY_ROUTER.toLowerCase())
    expect(calls[0]!.value).toBe(10000000000000000n)
  })

  it('builds approval + swap calls for USDC -> ETH', async () => {
    mockFetch.mockResolvedValueOnce(
      mockQuoteResponse({
        tokenIn: USDC_SEPOLIA.address,
        tokenOut: NATIVE_ZERO,
        amountIn: '25000000',
        amountOut: '10000000000000000',
      }),
    )
    mockFetch.mockResolvedValueOnce(mockApprovalResponse(true))
    mockFetch.mockResolvedValueOnce(
      mockSwapResponse(
        encodeExecute(
          [V3_SWAP_EXACT_IN, UNWRAP_WETH],
          [
            encodeV3SwapExactInInput({
              recipient: ADDRESS_THIS,
              amountIn: 25000000n,
              amountOutMin: 9950000000000000n,
              path: encodeV3Path(USDC_SEPOLIA.address, 3000, WETH),
            }),
            encodeUnwrapWethInput(MSG_SENDER, 9950000000000000n),
          ],
        ),
        '0',
      ),
    )

    const { calls } = await buildApiSwapCalls(API_KEY, 84532, SWAPPER, {
      tokenIn: USDC_SEPOLIA,
      tokenOut: ETH_TOKEN,
      amountIn: '25',
    })

    expect(calls).toHaveLength(2)
    expect(calls[0]!.to.toLowerCase()).toBe(USDC_SEPOLIA.address.toLowerCase())
    expect(calls[1]!.to.toLowerCase()).toBe(PROXY_ROUTER.toLowerCase())
  })

  it('rejects swap that routes output to the wrong recipient', async () => {
    mockFetch.mockResolvedValueOnce(mockQuoteResponse())
    mockFetch.mockResolvedValueOnce(
      mockSwapResponse(
        encodeExecute(
          [WRAP_ETH, V3_SWAP_EXACT_IN],
          [
            encodeWrapEthInput(ADDRESS_THIS, 10000000000000000n),
            encodeV3SwapExactInInput({
              recipient: EVIL,
              amountIn: 10000000000000000n,
              amountOutMin: 24875000n,
              path: encodeV3Path(WETH, 3000, USDC_SEPOLIA.address),
            }),
          ],
        ),
      ),
    )

    await expect(
      buildApiSwapCalls(API_KEY, 84532, SWAPPER, {
        tokenIn: ETH_TOKEN,
        tokenOut: USDC_SEPOLIA,
        amountIn: '0.01',
      }),
    ).rejects.toThrow('Swap transaction validation failed')
  })

  it('rejects approval with unknown spender', async () => {
    mockFetch.mockResolvedValueOnce(
      mockQuoteResponse({
        tokenIn: USDC_SEPOLIA.address,
        tokenOut: NATIVE_ZERO,
        amountIn: '25000000',
        amountOut: '10000000000000000',
      }),
    )
    mockFetch.mockResolvedValueOnce(mockApprovalResponse(true, 25000000n, EVIL))

    await expect(
      buildApiSwapCalls(API_KEY, 84532, SWAPPER, {
        tokenIn: USDC_SEPOLIA,
        tokenOut: ETH_TOKEN,
        amountIn: '25',
      }),
    ).rejects.toThrow('Approval validation failed')
  })

  it('skips approval call when token is already approved', async () => {
    mockFetch.mockResolvedValueOnce(
      mockQuoteResponse({
        tokenIn: USDC_SEPOLIA.address,
        tokenOut: NATIVE_ZERO,
        amountIn: '25000000',
        amountOut: '10000000000000000',
      }),
    )
    mockFetch.mockResolvedValueOnce(mockApprovalResponse(false))
    mockFetch.mockResolvedValueOnce(
      mockSwapResponse(
        encodeExecute(
          [V3_SWAP_EXACT_IN, UNWRAP_WETH],
          [
            encodeV3SwapExactInInput({
              recipient: ADDRESS_THIS,
              amountIn: 25000000n,
              amountOutMin: 9950000000000000n,
              path: encodeV3Path(USDC_SEPOLIA.address, 3000, WETH),
            }),
            encodeUnwrapWethInput(MSG_SENDER, 9950000000000000n),
          ],
        ),
        '0',
      ),
    )

    const { calls } = await buildApiSwapCalls(API_KEY, 84532, SWAPPER, {
      tokenIn: USDC_SEPOLIA,
      tokenOut: ETH_TOKEN,
      amountIn: '25',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.to.toLowerCase()).toBe(PROXY_ROUTER.toLowerCase())
  })
})
