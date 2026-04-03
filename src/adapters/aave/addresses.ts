import type { SupportedChainId } from '../../config/types.js'

export interface AaveAddresses {
  pool: `0x${string}`
  poolAddressesProvider: `0x${string}`
  uiPoolDataProvider: `0x${string}`
  rewardsController: `0x${string}`
}

// Aave V3 on Base mainnet
const BASE_ADDRESSES: AaveAddresses = {
  pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
  poolAddressesProvider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
  uiPoolDataProvider: '0x174446a6741300cD2E7C1b1A636Fee99c8F83502',
  rewardsController: '0xf9cc4F0D883F1a1eb2c253bdb46c254Ca51E1F44',
}

const ADDRESSES: Partial<Record<SupportedChainId, AaveAddresses>> = {
  8453: BASE_ADDRESSES,
  // Aave not available on Base Sepolia
}

export function getAaveAddresses(chainId: SupportedChainId): AaveAddresses | null {
  return ADDRESSES[chainId] ?? null
}
