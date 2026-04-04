import { describe, expect, it } from 'vitest'
import { encodeAbiParameters, encodeFunctionData, parseAbiParameters, type Hex } from 'viem'
import { erc20Abi } from '../../wallet-core/erc20-abi.js'
import { validateApprovalTransaction, validateQuoteIntent, validateSwapTransaction } from './api-validation.js'
import type { ApiTransactionRequest, QuoteResponse } from './api-types.js'

const PROXY_ROUTER = '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9'
const USDC_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const WETH = '0x4200000000000000000000000000000000000006'
const NATIVE_ZERO = '0x0000000000000000000000000000000000000000'
const SWAPPER = '0xabc1234567890abcdef1234567890abcdef123456'
const EVIL = '0x1111111111111111111111111111111111111111'
const MSG_SENDER = '0x0000000000000000000000000000000000000001'
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002'
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

function makeSwapTx(data: Hex, overrides: Partial<ApiTransactionRequest> = {}): ApiTransactionRequest {
  return {
    to: PROXY_ROUTER,
    from: SWAPPER,
    data,
    value: '10000000000000000',
    chainId: 84532,
    ...overrides,
  }
}

function makeQuoteResponse(overrides: Partial<QuoteResponse> = {}): QuoteResponse {
  return {
    requestId: 'req-1',
    routing: 'CLASSIC',
    permitData: null,
    quote: {
      input: { token: NATIVE_ZERO, amount: '10000000000000000' },
      output: { token: USDC_SEPOLIA, amount: '25000000', recipient: SWAPPER },
      swapper: SWAPPER,
      chainId: 84532,
      slippage: 0.5,
      tradeType: 'EXACT_INPUT',
      route: [],
      gasFee: '50000',
      gasFeeUSD: '0.12',
      gasUseEstimate: '150000',
      quoteId: 'q-1',
      routeString: 'ETH -> USDC',
      priceImpact: 0.01,
    },
    ...overrides,
  }
}

describe('validateSwapTransaction', () => {
  it('accepts a semantic ETH -> USDC classic route', () => {
    const data = encodeExecute(
      [WRAP_ETH, V3_SWAP_EXACT_IN, SWEEP],
      [
        encodeWrapEthInput(ADDRESS_THIS, 10000000000000000n),
        encodeV3SwapExactInInput({
          recipient: ADDRESS_THIS,
          amountIn: 10000000000000000n,
          amountOutMin: 24875000n,
          path: encodeV3Path(WETH, 3000, USDC_SEPOLIA),
        }),
        encodeSweepInput(USDC_SEPOLIA, MSG_SENDER, 24875000n),
      ],
    )

    const result = validateSwapTransaction(makeSwapTx(data), 84532, {
      expectedSwapper: SWAPPER,
      expectedRecipient: SWAPPER,
      expectedTokenIn: NATIVE_ZERO,
      expectedTokenOut: USDC_SEPOLIA,
      expectedAmountIn: 10000000000000000n,
      expectedAmountOutMinimum: 24875000n,
      expectedValue: 10000000000000000n,
      isNativeIn: true,
      expectedRouting: 'CLASSIC',
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects a swap that sends output to an arbitrary recipient', () => {
    const data = encodeExecute(
      [WRAP_ETH, V3_SWAP_EXACT_IN, SWEEP],
      [
        encodeWrapEthInput(ADDRESS_THIS, 10000000000000000n),
        encodeV3SwapExactInInput({
          recipient: EVIL,
          amountIn: 10000000000000000n,
          amountOutMin: 24875000n,
          path: encodeV3Path(WETH, 3000, USDC_SEPOLIA),
        }),
        encodeSweepInput(USDC_SEPOLIA, MSG_SENDER, 24875000n),
      ],
    )

    const result = validateSwapTransaction(makeSwapTx(data), 84532, {
      expectedSwapper: SWAPPER,
      expectedRecipient: SWAPPER,
      expectedTokenIn: NATIVE_ZERO,
      expectedTokenOut: USDC_SEPOLIA,
      expectedAmountIn: 10000000000000000n,
      expectedAmountOutMinimum: 24875000n,
      expectedValue: 10000000000000000n,
      isNativeIn: true,
      expectedRouting: 'CLASSIC',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('does not match recipient or router')]),
    )
  })

  it('rejects a swap path with the wrong output token', () => {
    const data = encodeExecute(
      [WRAP_ETH, V3_SWAP_EXACT_IN, SWEEP],
      [
        encodeWrapEthInput(ADDRESS_THIS, 10000000000000000n),
        encodeV3SwapExactInInput({
          recipient: ADDRESS_THIS,
          amountIn: 10000000000000000n,
          amountOutMin: 24875000n,
          path: encodeV3Path(WETH, 3000, EVIL),
        }),
        encodeSweepInput(USDC_SEPOLIA, MSG_SENDER, 24875000n),
      ],
    )

    const result = validateSwapTransaction(makeSwapTx(data), 84532, {
      expectedSwapper: SWAPPER,
      expectedRecipient: SWAPPER,
      expectedTokenIn: NATIVE_ZERO,
      expectedTokenOut: USDC_SEPOLIA,
      expectedAmountIn: 10000000000000000n,
      expectedAmountOutMinimum: 24875000n,
      expectedValue: 10000000000000000n,
      isNativeIn: true,
      expectedRouting: 'CLASSIC',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Swap output token')]))
  })

  it('rejects a swap with too-low min out', () => {
    const data = encodeExecute(
      [WRAP_ETH, V3_SWAP_EXACT_IN, SWEEP],
      [
        encodeWrapEthInput(ADDRESS_THIS, 10000000000000000n),
        encodeV3SwapExactInInput({
          recipient: ADDRESS_THIS,
          amountIn: 10000000000000000n,
          amountOutMin: 24000000n,
          path: encodeV3Path(WETH, 3000, USDC_SEPOLIA),
        }),
        encodeSweepInput(USDC_SEPOLIA, MSG_SENDER, 24000000n),
      ],
    )

    const result = validateSwapTransaction(makeSwapTx(data), 84532, {
      expectedSwapper: SWAPPER,
      expectedRecipient: SWAPPER,
      expectedTokenIn: NATIVE_ZERO,
      expectedTokenOut: USDC_SEPOLIA,
      expectedAmountIn: 10000000000000000n,
      expectedAmountOutMinimum: 24875000n,
      expectedValue: 10000000000000000n,
      isNativeIn: true,
      expectedRouting: 'CLASSIC',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('amountOutMin')]))
  })

  it('accepts a semantic USDC -> ETH classic route', () => {
    const data = encodeExecute(
      [V3_SWAP_EXACT_IN, UNWRAP_WETH],
      [
        encodeV3SwapExactInInput({
          recipient: ADDRESS_THIS,
          amountIn: 25000000n,
          amountOutMin: 9950000000000000n,
          path: encodeV3Path(USDC_SEPOLIA, 3000, WETH),
          payerIsUser: false,
        }),
        encodeUnwrapWethInput(MSG_SENDER, 9950000000000000n),
      ],
    )

    const result = validateSwapTransaction(makeSwapTx(data, { value: '0' }), 84532, {
      expectedSwapper: SWAPPER,
      expectedRecipient: SWAPPER,
      expectedTokenIn: USDC_SEPOLIA,
      expectedTokenOut: NATIVE_ZERO,
      expectedAmountIn: 25000000n,
      expectedAmountOutMinimum: 9950000000000000n,
      isNativeIn: false,
      expectedRouting: 'CLASSIC',
    })

    expect(result.valid).toBe(true)
  })

  it('rejects unsupported multi-swap plans', () => {
    const data = encodeExecute(
      [WRAP_ETH, V3_SWAP_EXACT_IN, V3_SWAP_EXACT_IN, SWEEP],
      [
        encodeWrapEthInput(ADDRESS_THIS, 10000000000000000n),
        encodeV3SwapExactInInput({
          recipient: ADDRESS_THIS,
          amountIn: 5000000000000000n,
          amountOutMin: 12000000n,
          path: encodeV3Path(WETH, 500, USDC_SEPOLIA),
        }),
        encodeV3SwapExactInInput({
          recipient: ADDRESS_THIS,
          amountIn: 5000000000000000n,
          amountOutMin: 12000000n,
          path: encodeV3Path(WETH, 3000, USDC_SEPOLIA),
        }),
        encodeSweepInput(USDC_SEPOLIA, MSG_SENDER, 24000000n),
      ],
    )

    const result = validateSwapTransaction(makeSwapTx(data), 84532, {
      expectedSwapper: SWAPPER,
      expectedRecipient: SWAPPER,
      expectedTokenIn: NATIVE_ZERO,
      expectedTokenOut: USDC_SEPOLIA,
      expectedAmountIn: 10000000000000000n,
      expectedAmountOutMinimum: 24000000n,
      expectedValue: 10000000000000000n,
      isNativeIn: true,
      expectedRouting: 'CLASSIC',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('exactly one exact-input swap command')]),
    )
  })
})

describe('validateQuoteIntent', () => {
  it('accepts a matching classic quote', () => {
    const result = validateQuoteIntent(makeQuoteResponse(), NATIVE_ZERO, USDC_SEPOLIA, 84532, {
      expectedAmountIn: 10000000000000000n,
      expectedRecipient: SWAPPER,
      expectedSwapper: SWAPPER,
    })

    expect(result.valid).toBe(true)
  })

  it('rejects quote recipient mismatch', () => {
    const result = validateQuoteIntent(makeQuoteResponse(), NATIVE_ZERO, USDC_SEPOLIA, 84532, {
      expectedRecipient: EVIL,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Quote recipient')]))
  })

  it('rejects quote input amount mismatch', () => {
    const result = validateQuoteIntent(makeQuoteResponse(), NATIVE_ZERO, USDC_SEPOLIA, 84532, {
      expectedAmountIn: 1n,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Quote input amount')]))
  })
})

describe('validateApprovalTransaction', () => {
  it('accepts approval with known router spender and matching amount', () => {
    const tx: ApiTransactionRequest = {
      to: USDC_SEPOLIA,
      from: SWAPPER,
      data: encodeApprove(PROXY_ROUTER, 1000000n),
      value: '0',
      chainId: 84532,
    }

    const result = validateApprovalTransaction(tx, USDC_SEPOLIA, 84532, 1000000n)
    expect(result.valid).toBe(true)
  })

  it('accepts ethereum sepolia approvals to the known universal router spender', () => {
    const tx: ApiTransactionRequest = {
      to: WETH,
      from: SWAPPER,
      data: encodeApprove(PROXY_ROUTER, 1000000n),
      value: '0',
      chainId: 11155111,
    }

    const result = validateApprovalTransaction(tx, WETH, 11155111, 1000000n)
    expect(result.valid).toBe(true)
  })

  it('rejects approval with unknown spender', () => {
    const tx: ApiTransactionRequest = {
      to: USDC_SEPOLIA,
      from: SWAPPER,
      data: encodeApprove(EVIL, 1000000n),
      value: '0',
      chainId: 84532,
    }

    const result = validateApprovalTransaction(tx, USDC_SEPOLIA, 84532)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('not a known Uniswap Router')]))
  })
})
