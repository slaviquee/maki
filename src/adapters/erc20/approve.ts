import { encodeFunctionData, type Hex } from 'viem'
import { erc20Abi } from '../../wallet-core/erc20-abi.js'
import type { TokenInfo } from '../../wallet-core/types.js'
import type { UserOpCall } from '../../wallet-core/userop.js'

/**
 * Builds a UserOp call to revoke (set to 0) an ERC-20 approval.
 */
export function buildRevokeApproval(token: TokenInfo, spender: `0x${string}`): UserOpCall {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, 0n],
  })

  return {
    to: token.address,
    data: data as Hex,
    value: 0n,
  }
}
