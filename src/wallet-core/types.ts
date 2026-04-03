import type { SupportedChainId } from '../config/types.js'

export interface TokenInfo {
  symbol: string
  name: string
  decimals: number
  address: `0x${string}`
  chainId: SupportedChainId
}

export interface TokenBalance {
  token: TokenInfo
  raw: bigint
  formatted: string
}

export interface WalletBalances {
  address: `0x${string}`
  chainId: SupportedChainId
  eth: { raw: bigint; formatted: string }
  tokens: TokenBalance[]
  timestamp: number
}

export interface Allowance {
  token: TokenInfo
  spender: `0x${string}`
  spenderLabel?: string
  raw: bigint
  formatted: string
  isUnlimited: boolean
}

export interface EnsResolution {
  name: string
  address: `0x${string}` | null
  avatar?: string
  error?: string
}
