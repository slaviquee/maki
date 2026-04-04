import type { SupportedChainId } from '../config/types.js'
import type { TokenInfo } from './types.js'

const BASE_TOKENS: TokenInfo[] = [
  {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    address: '0x0000000000000000000000000000000000000000',
    chainId: 8453,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    chainId: 8453,
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    address: '0x4200000000000000000000000000000000000006',
    chainId: 8453,
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    chainId: 8453,
  },
  {
    symbol: 'cbETH',
    name: 'Coinbase Wrapped Staked ETH',
    decimals: 18,
    address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    chainId: 8453,
  },
]

const BASE_SEPOLIA_TOKENS: TokenInfo[] = [
  {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    address: '0x0000000000000000000000000000000000000000',
    chainId: 84532,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    chainId: 84532,
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    address: '0x4200000000000000000000000000000000000006',
    chainId: 84532,
  },
]

const ETHEREUM_SEPOLIA_TOKENS: TokenInfo[] = [
  {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    address: '0x0000000000000000000000000000000000000000',
    chainId: 11155111,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    chainId: 11155111,
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    chainId: 11155111,
  },
]

const REGISTRY: Record<SupportedChainId, TokenInfo[]> = {
  8453: BASE_TOKENS,
  84532: BASE_SEPOLIA_TOKENS,
  11155111: ETHEREUM_SEPOLIA_TOKENS,
}

export function getTokenRegistry(chainId: SupportedChainId): TokenInfo[] {
  return REGISTRY[chainId] ?? []
}

export function findToken(chainId: SupportedChainId, symbolOrAddress: string): TokenInfo | undefined {
  const tokens = getTokenRegistry(chainId)
  const lower = symbolOrAddress.toLowerCase()
  return tokens.find((t) => t.symbol.toLowerCase() === lower || t.address.toLowerCase() === lower)
}
