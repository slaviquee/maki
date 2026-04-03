import { encodeFunctionData, parseUnits, type Hex } from 'viem'
import { erc20Abi } from '../../wallet-core/erc20-abi.js'
import type { TokenInfo } from '../../wallet-core/types.js'
import type { UserOpCall } from '../../wallet-core/userop.js'

export interface TransferParams {
  token: TokenInfo
  to: `0x${string}`
  amount: string // human-readable (e.g. "100" for 100 USDC)
}

/**
 * Builds a UserOp call for an ERC-20 transfer.
 */
export function buildErc20Transfer(params: TransferParams): UserOpCall {
  const rawAmount = parseUnits(params.amount, params.token.decimals)

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [params.to, rawAmount],
  })

  return {
    to: params.token.address,
    data: data as Hex,
    value: 0n,
  }
}

/**
 * Builds a UserOp call for a native ETH transfer.
 */
export function buildNativeTransfer(to: `0x${string}`, amountEth: string): UserOpCall {
  const rawAmount = parseUnits(amountEth, 18)

  return {
    to,
    data: '0x',
    value: rawAmount,
  }
}
