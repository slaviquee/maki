import { encodeFunctionData, type Hex } from 'viem'
import { aaveRewardsControllerAbi } from './abis.js'
import { getAaveAddresses } from './addresses.js'
import type { SupportedChainId } from '../../config/types.js'
import type { UserOpCall } from '../../wallet-core/userop.js'

/**
 * Builds a UserOp call to claim all Aave rewards.
 */
export function buildClaimAllRewards(
  chainId: SupportedChainId,
  aTokens: `0x${string}`[],
  recipient: `0x${string}`,
): UserOpCall | null {
  const addresses = getAaveAddresses(chainId)
  if (!addresses) return null

  const data = encodeFunctionData({
    abi: aaveRewardsControllerAbi,
    functionName: 'claimAllRewards',
    args: [aTokens, recipient],
  })

  return {
    to: addresses.rewardsController,
    data: data as Hex,
    value: 0n,
  }
}
