import { base, baseSepolia } from 'viem/chains'
import type { Chain } from 'viem'
import type { SupportedChainId } from '../config/types.js'

export const CHAINS: Record<SupportedChainId, Chain> = {
  8453: base,
  84532: baseSepolia,
}

export const DEFAULT_RPC: Record<SupportedChainId, string> = {
  8453: 'https://mainnet.base.org',
  84532: 'https://sepolia.base.org',
}

export function chainName(chainId: SupportedChainId): string {
  return chainId === 8453 ? 'Base' : 'Base Sepolia'
}
