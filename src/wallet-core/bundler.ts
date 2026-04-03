import { http, type Chain } from 'viem'
import { createBundlerClient, type SmartAccount } from 'viem/account-abstraction'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import type { SupportedChainId } from '../config/types.js'
import { CHAINS } from './chains.js'

const PIMLICO_CHAIN_SLUGS: Record<SupportedChainId, string> = {
  8453: 'base',
  84532: 'base-sepolia',
}

export interface BundlerConfig {
  chainId: SupportedChainId
  apiKey: string
}

/**
 * Creates a Pimlico bundler client for submitting UserOperations.
 */
export function createPimlicoBundlerClient(config: BundlerConfig): ReturnType<typeof createPimlicoClient> {
  const slug = PIMLICO_CHAIN_SLUGS[config.chainId]
  if (!slug) throw new Error(`No bundler available for chain ${config.chainId}`)

  const url = `https://api.pimlico.io/v2/${slug}/rpc?apikey=${config.apiKey}`
  const chain = CHAINS[config.chainId] as Chain

  return createPimlicoClient({
    transport: http(url),
    chain,
    entryPoint: {
      address: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
      version: '0.6',
    },
  })
}

/**
 * Creates a viem bundler client for a smart account.
 */
export function createAccountBundlerClient(
  account: SmartAccount,
  chain: Chain,
  bundlerUrl: string,
) {
  return createBundlerClient({
    account,
    chain,
    transport: http(bundlerUrl),
  })
}
