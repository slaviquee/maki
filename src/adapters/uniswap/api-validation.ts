/**
 * Validates Uniswap API responses before they enter the signing pipeline.
 *
 * Even though the Uniswap API is conditionally trusted, Maki validates
 * API-returned transaction data against locally-resolved intent to ensure:
 * - target addresses are known Universal Router contracts
 * - quote recipient/input/output match resolved intent
 * - approval calldata decodes to approve(knownRouter, boundedAmount)
 * - swap calldata decodes as Universal Router execute(...)
 * - decoded router commands match the expected token flow, recipient, and min-out
 */

import { decodeAbiParameters, decodeFunctionData, type Hex, parseAbiParameters } from 'viem'
import { erc20Abi } from '../../wallet-core/erc20-abi.js'
import { findToken } from '../../wallet-core/tokens.js'
import type { ApiTransactionRequest, QuoteResponse, RoutingType } from './api-types.js'
import type { SupportedChainId } from '../../config/types.js'

const COMMAND_TYPE_MASK = 0x7f

const COMMAND = {
  V3_SWAP_EXACT_IN: 0x00,
  SWEEP: 0x04,
  V2_SWAP_EXACT_IN: 0x08,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
} as const

const MSG_SENDER = '0x0000000000000000000000000000000000000001'
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002'
const NATIVE_ZERO = '0x0000000000000000000000000000000000000000'
const CONTRACT_BALANCE = 1n << 255n

const universalRouterExecuteAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
    ],
    outputs: [],
  },
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

/**
 * Known Uniswap contract addresses that the API may target.
 * Proxy Universal Router is used when x-permit2-disabled: true.
 */
const KNOWN_ROUTER_ADDRESSES: Record<SupportedChainId, Set<string>> = {
  8453: new Set([
    '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'.toLowerCase(),
    '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9'.toLowerCase(),
    '0x6ff5693b99212Da76ad316178A184AB56D299b43'.toLowerCase(),
  ]),
  84532: new Set([
    '0x050E797f3625EC8785265e1d9BDd4799b97528A1'.toLowerCase(),
    '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9'.toLowerCase(),
    '0xf70536B3bcC1bD1a972dc186A2cf84cC6da6Be5D'.toLowerCase(),
  ]),
  11155111: new Set([
    '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9'.toLowerCase(),
    '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b'.toLowerCase(),
  ]),
}

interface DecodedV3SwapExactIn {
  type: 'V3_SWAP_EXACT_IN'
  recipient: string
  amountIn: bigint
  amountOutMin: bigint
  path: Hex
  payerIsUser: boolean
}

interface DecodedV2SwapExactIn {
  type: 'V2_SWAP_EXACT_IN'
  recipient: string
  amountIn: bigint
  amountOutMin: bigint
  path: string[]
  payerIsUser: boolean
}

interface DecodedWrapEth {
  type: 'WRAP_ETH'
  recipient: string
  amount: bigint
}

interface DecodedUnwrapWeth {
  type: 'UNWRAP_WETH'
  recipient: string
  amountMinimum: bigint
}

interface DecodedSweep {
  type: 'SWEEP'
  token: string
  recipient: string
  amountMinimum: bigint
}

type DecodedRouterCommand =
  | DecodedV3SwapExactIn
  | DecodedV2SwapExactIn
  | DecodedWrapEth
  | DecodedUnwrapWeth
  | DecodedSweep

interface DecodedRouterPlan {
  commands: DecodedRouterCommand[]
  errors: string[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function wrappedNativeToken(chainId: SupportedChainId): string {
  const weth = findToken(chainId, 'WETH')
  if (!weth) throw new Error(`Wrapped native token not configured for chain ${chainId}`)
  return weth.address.toLowerCase()
}

function allKnownRouters(chainId: SupportedChainId): Set<string> {
  return KNOWN_ROUTER_ADDRESSES[chainId] ?? new Set()
}

function resolveRecipient(recipient: string, routerAddress: string, swapper: string): string {
  if (sameAddress(recipient, MSG_SENDER)) return swapper
  if (sameAddress(recipient, ADDRESS_THIS)) return routerAddress
  return recipient
}

function parseCommandBytes(commandsHex: Hex): number[] {
  const raw = commandsHex.slice(2)
  const parsed: number[] = []
  for (let i = 0; i < raw.length; i += 2) {
    parsed.push(parseInt(raw.slice(i, i + 2), 16) & COMMAND_TYPE_MASK)
  }
  return parsed
}

function decodeV3PathEndpoints(path: Hex): { tokenIn: string; tokenOut: string } | null {
  const raw = path.slice(2)
  const bytesLength = raw.length / 2
  if (bytesLength < 43 || (bytesLength - 20) % 23 !== 0) {
    return null
  }

  return {
    tokenIn: `0x${raw.slice(0, 40)}`.toLowerCase(),
    tokenOut: `0x${raw.slice(-40)}`.toLowerCase(),
  }
}

function decodeRouterPlan(data: Hex): DecodedRouterPlan {
  const errors: string[] = []

  let decoded: ReturnType<typeof decodeFunctionData<typeof universalRouterExecuteAbi>>
  try {
    decoded = decodeFunctionData({
      abi: universalRouterExecuteAbi,
      data,
    })
  } catch {
    return {
      commands: [],
      errors: ['Failed to decode swap calldata as Universal Router execute(...)'],
    }
  }

  if (decoded.functionName !== 'execute') {
    return {
      commands: [],
      errors: [`Unexpected router function ${decoded.functionName}()`],
    }
  }

  const commandsHex = decoded.args[0] as Hex
  const inputs = decoded.args[1] as readonly Hex[]
  const commandBytes = parseCommandBytes(commandsHex)

  if (commandBytes.length !== inputs.length) {
    return {
      commands: [],
      errors: [`Router command/input mismatch: ${commandBytes.length} commands vs ${inputs.length} inputs`],
    }
  }

  const commands: DecodedRouterCommand[] = []

  for (let i = 0; i < commandBytes.length; i++) {
    const commandType = commandBytes[i]!
    const input = inputs[i]!

    try {
      switch (commandType) {
        case COMMAND.V3_SWAP_EXACT_IN: {
          const [recipient, amountIn, amountOutMin, path, payerIsUser] = decodeAbiParameters(
            parseAbiParameters(
              'address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser',
            ),
            input,
          )
          commands.push({
            type: 'V3_SWAP_EXACT_IN',
            recipient,
            amountIn,
            amountOutMin,
            path,
            payerIsUser,
          })
          break
        }
        case COMMAND.V2_SWAP_EXACT_IN: {
          const [recipient, amountIn, amountOutMin, path, payerIsUser] = decodeAbiParameters(
            parseAbiParameters(
              'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser',
            ),
            input,
          )
          commands.push({
            type: 'V2_SWAP_EXACT_IN',
            recipient,
            amountIn,
            amountOutMin,
            path,
            payerIsUser,
          })
          break
        }
        case COMMAND.WRAP_ETH: {
          const [recipient, amount] = decodeAbiParameters(
            parseAbiParameters('address recipient, uint256 amount'),
            input,
          )
          commands.push({ type: 'WRAP_ETH', recipient, amount })
          break
        }
        case COMMAND.UNWRAP_WETH: {
          const [recipient, amountMinimum] = decodeAbiParameters(
            parseAbiParameters('address recipient, uint256 amountMinimum'),
            input,
          )
          commands.push({ type: 'UNWRAP_WETH', recipient, amountMinimum })
          break
        }
        case COMMAND.SWEEP: {
          const [token, recipient, amountMinimum] = decodeAbiParameters(
            parseAbiParameters('address token, address recipient, uint256 amountMinimum'),
            input,
          )
          commands.push({ type: 'SWEEP', token, recipient, amountMinimum })
          break
        }
        default:
          errors.push(`Unsupported router command 0x${commandType.toString(16).padStart(2, '0')}`)
      }
    } catch {
      errors.push(`Failed to decode router command 0x${commandType.toString(16).padStart(2, '0')}`)
    }
  }

  return { commands, errors }
}

function getSwapEndpoints(
  command: DecodedV2SwapExactIn | DecodedV3SwapExactIn,
): { tokenIn: string; tokenOut: string } | null {
  if (command.type === 'V2_SWAP_EXACT_IN') {
    if (command.path.length < 2) return null
    return {
      tokenIn: command.path[0]!.toLowerCase(),
      tokenOut: command.path[command.path.length - 1]!.toLowerCase(),
    }
  }

  return decodeV3PathEndpoints(command.path)
}

function validateClassicPlan(
  tx: ApiTransactionRequest,
  commands: DecodedRouterCommand[],
  expectedChainId: SupportedChainId,
  options: Required<
    Pick<
      NonNullable<Parameters<typeof validateSwapTransaction>[2]>,
      | 'expectedSwapper'
      | 'expectedRecipient'
      | 'expectedTokenIn'
      | 'expectedTokenOut'
      | 'expectedAmountIn'
      | 'expectedAmountOutMinimum'
    >
  > &
    Pick<NonNullable<Parameters<typeof validateSwapTransaction>[2]>, 'isNativeIn'>,
): string[] {
  const errors: string[] = []
  const routerAddress = tx.to.toLowerCase()
  const expectedSwapper = options.expectedSwapper.toLowerCase()
  const expectedRecipient = options.expectedRecipient.toLowerCase()
  const expectedTokenIn = options.expectedTokenIn.toLowerCase()
  const expectedTokenOut = options.expectedTokenOut.toLowerCase()
  const weth = wrappedNativeToken(expectedChainId)

  const swapCommands = commands.filter(
    (command): command is DecodedV2SwapExactIn | DecodedV3SwapExactIn =>
      command.type === 'V2_SWAP_EXACT_IN' || command.type === 'V3_SWAP_EXACT_IN',
  )
  const wrapCommands = commands.filter((command): command is DecodedWrapEth => command.type === 'WRAP_ETH')
  const unwrapCommands = commands.filter((command): command is DecodedUnwrapWeth => command.type === 'UNWRAP_WETH')
  const sweepCommands = commands.filter((command): command is DecodedSweep => command.type === 'SWEEP')

  if (swapCommands.length !== 1) {
    errors.push(`Expected exactly one exact-input swap command, got ${swapCommands.length}`)
    return errors
  }

  const swap = swapCommands[0]!
  const endpoints = getSwapEndpoints(swap)
  if (!endpoints) {
    errors.push('Failed to decode swap path endpoints')
    return errors
  }

  const expectedSwapInput = options.isNativeIn ? weth : expectedTokenIn
  const expectedSwapOutput = sameAddress(expectedTokenOut, NATIVE_ZERO) ? weth : expectedTokenOut

  if (!sameAddress(endpoints.tokenIn, expectedSwapInput)) {
    errors.push(`Swap input token ${endpoints.tokenIn} does not match expected ${expectedSwapInput}`)
  }
  if (!sameAddress(endpoints.tokenOut, expectedSwapOutput)) {
    errors.push(`Swap output token ${endpoints.tokenOut} does not match expected ${expectedSwapOutput}`)
  }
  if (swap.amountIn !== options.expectedAmountIn) {
    errors.push(`Swap amountIn ${swap.amountIn} does not match expected ${options.expectedAmountIn}`)
  }
  if (swap.amountOutMin < options.expectedAmountOutMinimum) {
    errors.push(`Swap amountOutMin ${swap.amountOutMin} is below expected minimum ${options.expectedAmountOutMinimum}`)
  }

  const swapRecipient = resolveRecipient(swap.recipient, routerAddress, expectedSwapper).toLowerCase()

  if (options.isNativeIn) {
    if (wrapCommands.length > 1) {
      errors.push(`Expected at most one WRAP_ETH command, got ${wrapCommands.length}`)
    }
    if (wrapCommands.length === 1) {
      const wrap = wrapCommands[0]!
      const wrapRecipient = resolveRecipient(wrap.recipient, routerAddress, expectedSwapper).toLowerCase()
      if (wrap.amount !== options.expectedAmountIn && wrap.amount !== CONTRACT_BALANCE) {
        errors.push(`WRAP_ETH amount ${wrap.amount} does not match expected ${options.expectedAmountIn}`)
      }
      if (wrapRecipient !== routerAddress) {
        errors.push('WRAP_ETH recipient must route wrapped WETH back to the router for the swap leg')
      }
    }
  } else if (wrapCommands.length > 0) {
    errors.push('Unexpected WRAP_ETH command for ERC-20 input swap')
  }

  if (sameAddress(expectedTokenOut, NATIVE_ZERO)) {
    if (swapRecipient !== routerAddress) {
      errors.push('ETH-out swap must route WETH to the router before UNWRAP_WETH')
    }
    if (unwrapCommands.length !== 1) {
      errors.push(`Expected exactly one UNWRAP_WETH command, got ${unwrapCommands.length}`)
      return errors
    }

    const unwrap = unwrapCommands[0]!
    const unwrapRecipient = resolveRecipient(unwrap.recipient, routerAddress, expectedSwapper).toLowerCase()
    if (unwrapRecipient !== expectedRecipient) {
      errors.push(`UNWRAP_WETH recipient ${unwrapRecipient} does not match expected ${expectedRecipient}`)
    }
    if (unwrap.amountMinimum < options.expectedAmountOutMinimum) {
      errors.push(
        `UNWRAP_WETH amountMinimum ${unwrap.amountMinimum} is below expected minimum ${options.expectedAmountOutMinimum}`,
      )
    }
    if (sweepCommands.length > 0) {
      errors.push('Unexpected SWEEP command in ETH-out swap plan')
    }
  } else {
    if (unwrapCommands.length > 0) {
      errors.push('Unexpected UNWRAP_WETH command in ERC-20 output swap')
    }

    if (swapRecipient === expectedRecipient) {
      if (sweepCommands.length > 0) {
        errors.push('Unexpected SWEEP command when swap already delivers output to the recipient')
      }
    } else if (swapRecipient === routerAddress) {
      if (sweepCommands.length !== 1) {
        errors.push(`Expected exactly one SWEEP command, got ${sweepCommands.length}`)
      } else {
        const sweep = sweepCommands[0]!
        const sweepRecipient = resolveRecipient(sweep.recipient, routerAddress, expectedSwapper).toLowerCase()
        if (!sameAddress(sweep.token, expectedTokenOut)) {
          errors.push(`SWEEP token ${sweep.token} does not match expected ${expectedTokenOut}`)
        }
        if (sweepRecipient !== expectedRecipient) {
          errors.push(`SWEEP recipient ${sweepRecipient} does not match expected ${expectedRecipient}`)
        }
        if (sweep.amountMinimum < options.expectedAmountOutMinimum) {
          errors.push(
            `SWEEP amountMinimum ${sweep.amountMinimum} is below expected minimum ${options.expectedAmountOutMinimum}`,
          )
        }
      }
    } else {
      errors.push(`Swap recipient ${swapRecipient} does not match recipient or router`)
    }
  }

  return errors
}

function validateWrapPlan(
  tx: ApiTransactionRequest,
  commands: DecodedRouterCommand[],
  expectedChainId: SupportedChainId,
  options: Required<
    Pick<
      NonNullable<Parameters<typeof validateSwapTransaction>[2]>,
      'expectedSwapper' | 'expectedRecipient' | 'expectedTokenOut' | 'expectedAmountIn'
    >
  >,
): string[] {
  const errors: string[] = []
  const routerAddress = tx.to.toLowerCase()
  const expectedSwapper = options.expectedSwapper.toLowerCase()
  const expectedRecipient = options.expectedRecipient.toLowerCase()
  const expectedTokenOut = options.expectedTokenOut.toLowerCase()
  const weth = wrappedNativeToken(expectedChainId)

  if (!sameAddress(expectedTokenOut, weth)) {
    errors.push(`WRAP routing must output WETH (${weth}), got ${expectedTokenOut}`)
  }

  const wrapCommands = commands.filter((command): command is DecodedWrapEth => command.type === 'WRAP_ETH')
  const sweepCommands = commands.filter((command): command is DecodedSweep => command.type === 'SWEEP')
  const otherCommands = commands.filter((command) => command.type !== 'WRAP_ETH' && command.type !== 'SWEEP')

  if (otherCommands.length > 0) {
    errors.push(`Unsupported commands in WRAP plan: ${otherCommands.map((command) => command.type).join(', ')}`)
  }
  if (wrapCommands.length !== 1) {
    errors.push(`Expected exactly one WRAP_ETH command, got ${wrapCommands.length}`)
    return errors
  }

  const wrap = wrapCommands[0]!
  if (wrap.amount !== options.expectedAmountIn && wrap.amount !== CONTRACT_BALANCE) {
    errors.push(`WRAP_ETH amount ${wrap.amount} does not match expected ${options.expectedAmountIn}`)
  }

  const wrapRecipient = resolveRecipient(wrap.recipient, routerAddress, expectedSwapper).toLowerCase()
  if (wrapRecipient === expectedRecipient) {
    if (sweepCommands.length > 0) {
      errors.push('Unexpected SWEEP command when WRAP_ETH already sends WETH to the recipient')
    }
  } else if (wrapRecipient === routerAddress) {
    if (sweepCommands.length !== 1) {
      errors.push(`Expected exactly one SWEEP command, got ${sweepCommands.length}`)
    } else {
      const sweep = sweepCommands[0]!
      const sweepRecipient = resolveRecipient(sweep.recipient, routerAddress, expectedSwapper).toLowerCase()
      if (!sameAddress(sweep.token, weth)) {
        errors.push(`SWEEP token ${sweep.token} does not match WETH ${weth}`)
      }
      if (sweepRecipient !== expectedRecipient) {
        errors.push(`SWEEP recipient ${sweepRecipient} does not match expected ${expectedRecipient}`)
      }
      if (sweep.amountMinimum > options.expectedAmountIn) {
        errors.push(`SWEEP amountMinimum ${sweep.amountMinimum} exceeds wrapped amount ${options.expectedAmountIn}`)
      }
    }
  } else {
    errors.push(`WRAP_ETH recipient ${wrapRecipient} does not match recipient or router`)
  }

  return errors
}

function validateUnwrapPlan(
  tx: ApiTransactionRequest,
  commands: DecodedRouterCommand[],
  options: Required<
    Pick<
      NonNullable<Parameters<typeof validateSwapTransaction>[2]>,
      'expectedSwapper' | 'expectedRecipient' | 'expectedTokenOut' | 'expectedAmountOutMinimum'
    >
  >,
): string[] {
  const errors: string[] = []
  const routerAddress = tx.to.toLowerCase()
  const expectedSwapper = options.expectedSwapper.toLowerCase()
  const expectedRecipient = options.expectedRecipient.toLowerCase()

  if (!sameAddress(options.expectedTokenOut, NATIVE_ZERO)) {
    errors.push(`UNWRAP routing must output native ETH (${NATIVE_ZERO}), got ${options.expectedTokenOut}`)
  }

  const unwrapCommands = commands.filter((command): command is DecodedUnwrapWeth => command.type === 'UNWRAP_WETH')
  const otherCommands = commands.filter((command) => command.type !== 'UNWRAP_WETH')

  if (otherCommands.length > 0) {
    errors.push(`Unsupported commands in UNWRAP plan: ${otherCommands.map((command) => command.type).join(', ')}`)
  }
  if (unwrapCommands.length !== 1) {
    errors.push(`Expected exactly one UNWRAP_WETH command, got ${unwrapCommands.length}`)
    return errors
  }

  const unwrap = unwrapCommands[0]!
  const unwrapRecipient = resolveRecipient(unwrap.recipient, routerAddress, expectedSwapper).toLowerCase()
  if (unwrapRecipient !== expectedRecipient) {
    errors.push(`UNWRAP_WETH recipient ${unwrapRecipient} does not match expected ${expectedRecipient}`)
  }
  if (unwrap.amountMinimum < options.expectedAmountOutMinimum) {
    errors.push(
      `UNWRAP_WETH amountMinimum ${unwrap.amountMinimum} is below expected minimum ${options.expectedAmountOutMinimum}`,
    )
  }

  return errors
}

/**
 * Validates an API-returned swap transaction against the resolved intent.
 */
export function validateSwapTransaction(
  tx: ApiTransactionRequest,
  expectedChainId: SupportedChainId,
  options?: {
    expectedSwapper?: string
    expectedRecipient?: string
    expectedTokenIn?: string
    expectedTokenOut?: string
    expectedAmountIn?: bigint
    expectedAmountOutMinimum?: bigint
    expectedValue?: bigint
    isNativeIn?: boolean
    expectedRouting?: RoutingType
  },
): ValidationResult {
  const errors: string[] = []

  if (tx.chainId !== expectedChainId) {
    errors.push(`Chain ID mismatch: expected ${expectedChainId}, got ${tx.chainId}`)
  }

  const knownRouters = KNOWN_ROUTER_ADDRESSES[expectedChainId]
  if (knownRouters && !knownRouters.has(tx.to.toLowerCase())) {
    errors.push(`Swap target ${tx.to} is not a known Uniswap Router on chain ${expectedChainId}`)
  }

  if (!tx.data || tx.data === '0x' || tx.data.length < 10) {
    errors.push('Swap transaction has empty or missing calldata')
    return { valid: false, errors }
  }

  const plan = decodeRouterPlan(tx.data as Hex)
  errors.push(...plan.errors)

  if (options?.expectedSwapper && tx.from.toLowerCase() !== options.expectedSwapper.toLowerCase()) {
    errors.push(`Swap from ${tx.from} does not match expected swapper ${options.expectedSwapper}`)
  }

  if (options?.isNativeIn !== undefined) {
    const txValue = BigInt(tx.value || '0')
    if (options.isNativeIn) {
      if (options.expectedValue !== undefined && txValue !== options.expectedValue) {
        errors.push(`Native ETH value mismatch: expected ${options.expectedValue}, got ${txValue}`)
      }
      if (txValue === 0n) {
        errors.push('Native-in swap has zero ETH value')
      }
    } else if (txValue !== 0n) {
      errors.push(`ERC-20 swap should have zero ETH value, got ${txValue}`)
    }
  }

  if (plan.errors.length > 0 || !options?.expectedRouting || !options.expectedSwapper) {
    return { valid: errors.length === 0, errors }
  }

  const semanticOptions = {
    expectedSwapper: options.expectedSwapper,
    expectedRecipient: options.expectedRecipient ?? options.expectedSwapper,
    expectedTokenIn: options.expectedTokenIn ?? NATIVE_ZERO,
    expectedTokenOut: options.expectedTokenOut ?? NATIVE_ZERO,
    expectedAmountIn: options.expectedAmountIn ?? 0n,
    expectedAmountOutMinimum: options.expectedAmountOutMinimum ?? 0n,
    isNativeIn: options.isNativeIn,
  }

  switch (options.expectedRouting) {
    case 'WRAP':
      errors.push(
        ...validateWrapPlan(tx, plan.commands, expectedChainId, {
          expectedSwapper: semanticOptions.expectedSwapper,
          expectedRecipient: semanticOptions.expectedRecipient,
          expectedTokenOut: semanticOptions.expectedTokenOut,
          expectedAmountIn: semanticOptions.expectedAmountIn,
        }),
      )
      break
    case 'UNWRAP':
      errors.push(
        ...validateUnwrapPlan(tx, plan.commands, {
          expectedSwapper: semanticOptions.expectedSwapper,
          expectedRecipient: semanticOptions.expectedRecipient,
          expectedTokenOut: semanticOptions.expectedTokenOut,
          expectedAmountOutMinimum: semanticOptions.expectedAmountOutMinimum,
        }),
      )
      break
    default:
      errors.push(...validateClassicPlan(tx, plan.commands, expectedChainId, semanticOptions))
      break
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validates that the quote response matches the user's resolved intent.
 */
export function validateQuoteIntent(
  quote: QuoteResponse,
  expectedTokenIn: string,
  expectedTokenOut: string,
  expectedChainId: SupportedChainId,
  options?: {
    expectedAmountIn?: bigint
    expectedRecipient?: string
    expectedSwapper?: string
  },
): ValidationResult {
  const errors: string[] = []

  const supported: RoutingType[] = ['CLASSIC', 'WRAP', 'UNWRAP']
  if (!supported.includes(quote.routing)) {
    errors.push(`Unsupported routing type: ${quote.routing}`)
  }

  if (quote.quote.chainId !== expectedChainId) {
    errors.push(`Quote chain ${quote.quote.chainId} does not match expected ${expectedChainId}`)
  }

  if (options?.expectedAmountIn !== undefined && quote.quote.input.amount !== options.expectedAmountIn.toString()) {
    errors.push(`Quote input amount ${quote.quote.input.amount} does not match expected ${options.expectedAmountIn}`)
  }

  if (options?.expectedRecipient && !sameAddress(quote.quote.output.recipient, options.expectedRecipient)) {
    errors.push(`Quote recipient ${quote.quote.output.recipient} does not match expected ${options.expectedRecipient}`)
  }

  if (options?.expectedSwapper && !sameAddress(quote.quote.swapper, options.expectedSwapper)) {
    errors.push(`Quote swapper ${quote.quote.swapper} does not match expected ${options.expectedSwapper}`)
  }

  if (quote.routing === 'CLASSIC') {
    if (!sameAddress(quote.quote.input.token, expectedTokenIn)) {
      errors.push(`Quote input token ${quote.quote.input.token} does not match expected ${expectedTokenIn}`)
    }
    if (!sameAddress(quote.quote.output.token, expectedTokenOut)) {
      errors.push(`Quote output token ${quote.quote.output.token} does not match expected ${expectedTokenOut}`)
    }
  } else {
    const inputOk =
      sameAddress(quote.quote.input.token, expectedTokenIn) || sameAddress(quote.quote.input.token, NATIVE_ZERO)
    const outputOk =
      sameAddress(quote.quote.output.token, expectedTokenOut) || sameAddress(quote.quote.output.token, NATIVE_ZERO)

    if (!inputOk) {
      errors.push(`Quote input token mismatch for ${quote.routing}`)
    }
    if (!outputOk) {
      errors.push(`Quote output token mismatch for ${quote.routing}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validates an approval transaction by decoding approve(spender, amount)
 * and checking:
 * - target is the expected token contract
 * - chain ID matches
 * - calldata decodes as ERC-20 approve()
 * - spender is a known Uniswap Router on this chain
 * - amount does not exceed expectedMaxAmount (prevents unlimited approvals)
 */
export function validateApprovalTransaction(
  tx: ApiTransactionRequest,
  expectedTokenAddress: string,
  expectedChainId: SupportedChainId,
  expectedMaxAmount?: bigint,
): ValidationResult {
  const errors: string[] = []

  if (tx.chainId !== expectedChainId) {
    errors.push(`Approval chain ID mismatch: expected ${expectedChainId}, got ${tx.chainId}`)
  }

  if (tx.to.toLowerCase() !== expectedTokenAddress.toLowerCase()) {
    errors.push(`Approval target ${tx.to} does not match token address ${expectedTokenAddress}`)
  }

  if (!tx.data || tx.data === '0x' || tx.data.length < 10) {
    errors.push('Approval transaction has empty or missing calldata')
    return { valid: false, errors }
  }

  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: tx.data as Hex,
    })

    if (decoded.functionName !== 'approve') {
      errors.push(`Expected approve() call, got ${decoded.functionName}()`)
      return { valid: false, errors }
    }

    const [spender, amount] = decoded.args as [string, bigint]

    const knownRouters = allKnownRouters(expectedChainId)
    if (!knownRouters.has(spender.toLowerCase())) {
      errors.push(`Approval spender ${spender} is not a known Uniswap Router on chain ${expectedChainId}`)
    }

    if (expectedMaxAmount !== undefined && amount > expectedMaxAmount) {
      errors.push(`Approval amount ${amount} exceeds expected max ${expectedMaxAmount}`)
    }
  } catch {
    errors.push('Failed to decode approval calldata as ERC-20 approve(address,uint256)')
  }

  return { valid: errors.length === 0, errors }
}
