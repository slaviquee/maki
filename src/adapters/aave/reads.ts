import { type PublicClient, formatUnits } from 'viem'
import { aavePoolAbi, aaveRewardsControllerAbi } from './abis.js'
import { getAaveAddresses } from './addresses.js'
import type { SupportedChainId } from '../../config/types.js'

export interface AaveAccountSummary {
  totalCollateralUsd: string
  totalDebtUsd: string
  availableBorrowsUsd: string
  ltv: string
  liquidationThreshold: string
  healthFactor: string
}

export interface AaveRewardInfo {
  rewardToken: `0x${string}`
  amount: bigint
  formatted: string
}

/**
 * Gets the user's aggregate Aave V3 position summary.
 * All amounts are in USD (8 decimals from Aave's base currency).
 */
export async function getAaveAccountSummary(
  client: PublicClient,
  chainId: SupportedChainId,
  user: `0x${string}`,
): Promise<AaveAccountSummary | null> {
  const addresses = getAaveAddresses(chainId)
  if (!addresses) return null

  const result = await client.readContract({
    address: addresses.pool,
    abi: aavePoolAbi,
    functionName: 'getUserAccountData',
    args: [user],
  })

  const [totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor] =
    result

  return {
    totalCollateralUsd: formatUnits(totalCollateralBase, 8),
    totalDebtUsd: formatUnits(totalDebtBase, 8),
    availableBorrowsUsd: formatUnits(availableBorrowsBase, 8),
    ltv: (Number(ltv) / 100).toFixed(2) + '%',
    liquidationThreshold: (Number(currentLiquidationThreshold) / 100).toFixed(2) + '%',
    healthFactor: healthFactor > 0n ? formatUnits(healthFactor, 18) : 'N/A',
  }
}

/**
 * Checks pending Aave rewards for the user.
 */
export async function getAaveRewards(
  client: PublicClient,
  chainId: SupportedChainId,
  user: `0x${string}`,
  aTokens: `0x${string}`[],
  rewardToken: `0x${string}`,
): Promise<AaveRewardInfo | null> {
  const addresses = getAaveAddresses(chainId)
  if (!addresses) return null

  const amount = await client.readContract({
    address: addresses.rewardsController,
    abi: aaveRewardsControllerAbi,
    functionName: 'getUserRewards',
    args: [aTokens, user, rewardToken],
  })

  return {
    rewardToken,
    amount,
    formatted: formatUnits(amount, 18),
  }
}
