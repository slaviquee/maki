import type { SupportedChainId } from '../../config/types.js'

export interface AaveMarket {
  symbol: string
  underlying: `0x${string}`
  aToken: `0x${string}`
}

// Aave V3 markets on Base mainnet — deterministic registry
const BASE_MARKETS: AaveMarket[] = [
  {
    symbol: 'USDC',
    underlying: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    aToken: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
  },
  {
    symbol: 'WETH',
    underlying: '0x4200000000000000000000000000000000000006',
    aToken: '0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7',
  },
  {
    symbol: 'cbETH',
    underlying: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    aToken: '0xcf3D55c10DB69f28fD1A75Bd73f3D8A2d9c595ad',
  },
]

const MARKETS: Partial<Record<SupportedChainId, AaveMarket[]>> = {
  8453: BASE_MARKETS,
}

export function getAaveMarkets(chainId: SupportedChainId): AaveMarket[] {
  return MARKETS[chainId] ?? []
}

export function getAllATokens(chainId: SupportedChainId): `0x${string}`[] {
  return getAaveMarkets(chainId).map((m) => m.aToken)
}
