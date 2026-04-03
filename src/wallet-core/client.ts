import { createPublicClient, http, type PublicClient } from 'viem'
import type { SupportedChainId } from '../config/types.js'
import { CHAINS, DEFAULT_RPC } from './chains.js'

export function createBaseClient(chainId: SupportedChainId, rpcUrl?: string): PublicClient {
  const chain = CHAINS[chainId]
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`)

  return createPublicClient({
    chain,
    transport: http(rpcUrl ?? DEFAULT_RPC[chainId]),
  })
}
