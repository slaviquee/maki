import { base, baseSepolia, sepolia } from 'viem/chains'
import type { Chain } from 'viem'
import type { SupportedChainId } from '../config/types.js'

export const CHAINS: Record<SupportedChainId, Chain> = {
  8453: base,
  84532: baseSepolia,
  11155111: sepolia,
}

export const DEFAULT_RPC: Record<SupportedChainId, string> = {
  8453: 'https://mainnet.base.org',
  84532: 'https://sepolia.base.org',
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
}

export function chainName(chainId: SupportedChainId): string {
  switch (chainId) {
    case 8453:
      return 'Base'
    case 84532:
      return 'Base Sepolia'
    case 11155111:
      return 'Ethereum Sepolia'
  }
}
