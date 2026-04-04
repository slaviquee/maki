import { http, type Chain, type Hex } from 'viem'
import { createBundlerClient, type SmartAccount } from 'viem/account-abstraction'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import type { SupportedChainId } from '../config/types.js'
import type { UserOpCall } from './userop.js'
import { CHAINS } from './chains.js'
import { createBaseClient } from './client.js'

const PIMLICO_CHAIN_SLUGS: Record<SupportedChainId, string> = {
  8453: 'base',
  84532: 'base-sepolia',
  11155111: 'sepolia',
}

export interface SubmissionConfig {
  chainId: SupportedChainId
  bundlerApiKey: string
  rpcUrl?: string
}

export interface SubmissionResult {
  status: 'confirmed' | 'failed'
  userOpHash: Hex
  txHash?: Hex
  error?: string
  actualGasCost?: bigint
}

/**
 * Submits a UserOperation via the Pimlico bundler and waits for the receipt.
 *
 * The SmartAccount handles initCode for first-time (counterfactual) accounts
 * automatically — the bundler deploys the account atomically with the first op.
 *
 * Gas estimation and optional sponsorship are delegated to the Pimlico paymaster.
 */
export async function submitUserOperation(
  account: SmartAccount,
  calls: UserOpCall[],
  config: SubmissionConfig,
): Promise<SubmissionResult> {
  const slug = PIMLICO_CHAIN_SLUGS[config.chainId]
  if (!slug) throw new Error(`No bundler available for chain ${config.chainId}`)

  const bundlerUrl = `https://api.pimlico.io/v2/${slug}/rpc?apikey=${config.bundlerApiKey}`
  const chain = CHAINS[config.chainId] as Chain
  const client = createBaseClient(config.chainId, config.rpcUrl)

  const pimlicoClient = createPimlicoClient({
    transport: http(bundlerUrl),
    chain,
    entryPoint: {
      address: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
      version: '0.6',
    },
  })

  const bundlerClient = createBundlerClient({
    account,
    client,
    chain,
    transport: http(bundlerUrl),
    paymaster: pimlicoClient,
  })

  const userOpHash = await bundlerClient.sendUserOperation({
    calls: calls.map((c) => ({
      to: c.to,
      data: c.data ?? ('0x' as Hex),
      value: c.value ?? 0n,
    })),
  })

  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
    timeout: 120_000,
  })

  if (receipt.success) {
    return {
      status: 'confirmed',
      userOpHash,
      txHash: receipt.receipt.transactionHash,
      actualGasCost: receipt.actualGasCost,
    }
  }

  return {
    status: 'failed',
    userOpHash,
    txHash: receipt.receipt.transactionHash,
    error: receipt.reason ?? 'UserOperation reverted on-chain',
  }
}
