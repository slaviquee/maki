import { encodeFunctionData, type Hex } from 'viem'
import { erc20Abi } from '../../wallet-core/erc20-abi.js'
import { swapRouterAbi } from './abis.js'
import { getUniswapAddresses } from './addresses.js'
import type { SupportedChainId } from '../../config/types.js'
import type { SwapBuildParams } from './types.js'
import type { UserOpCall } from '../../wallet-core/userop.js'

/**
 * Builds UserOp calls for an exact-in swap on Uniswap V3.
 * Returns [approve (if needed), swap] calls.
 */
export function buildSwapCalls(
  chainId: SupportedChainId,
  params: SwapBuildParams,
): UserOpCall[] {
  const addresses = getUniswapAddresses(chainId)
  const { quote, recipient, slippageBps } = params

  // Calculate minimum output with slippage
  const amountOutMinimum =
    quote.amountOutRaw - (quote.amountOutRaw * BigInt(slippageBps)) / 10000n

  // Only native ETH (symbol "ETH", no contract address) triggers native path.
  // WETH is an ERC-20 and must go through the approve+swap path.
  const isNativeIn = quote.tokenIn.symbol === 'ETH' && quote.tokenIn.address !== addresses.weth
  const calls: UserOpCall[] = []

  // If tokenIn is not native ETH, we need an approval first
  if (!isNativeIn) {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [addresses.swapRouter, quote.amountInRaw],
    })

    calls.push({
      to: quote.tokenIn.address,
      data: approveData as Hex,
      value: 0n,
    })
  }

  // Build the swap call
  const swapData = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: isNativeIn ? addresses.weth : quote.tokenIn.address,
        tokenOut: quote.tokenOut.address,
        fee: quote.fee,
        recipient,
        amountIn: quote.amountInRaw,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })

  calls.push({
    to: addresses.swapRouter,
    data: swapData as Hex,
    value: isNativeIn ? quote.amountInRaw : 0n,
  })

  return calls
}
