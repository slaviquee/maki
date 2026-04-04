import type { SignerClient } from '../../signer/types.js'
import type { SupportedChainId } from '../../config/types.js'
import { createSmartAccount } from '../../wallet-core/account.js'
import type { PublicClient } from 'viem'
import { parseAgentkitChallenge, buildSiweMessage, isAgentkitChallenge } from './challenge.js'
import type { AgentkitPayload, AgentkitAccessResult, Caip2ChainId, SupportedChain } from './types.js'
import { toCaip2 } from './types.js'

export interface AgentkitClientConfig {
  signer: SignerClient
  chainClient: PublicClient
  chainId: SupportedChainId
  smartAccountAddress?: `0x${string}`
  accountMode?: 'smart-account' | 'eoa-demo'
}

/**
 * Attempts to access an AgentKit-protected endpoint.
 *
 * Flow:
 * 1. Make initial request
 * 2. If 402, parse AgentKit challenge
 * 3. Build SIWE message from challenge
 * 4. Sign with Maki's signer (via smart account for EIP-1271)
 * 5. Retry with `agentkit` header
 */
export async function accessProtectedEndpoint(
  config: AgentkitClientConfig,
  url: string,
  method: string = 'GET',
): Promise<AgentkitAccessResult> {
  if (config.accountMode === 'eoa-demo') {
    return {
      success: false,
      status: 0,
      verified: false,
      body: {},
      error: 'World AgentKit is only supported in smart-account mode. Switch back to the smart-account demo flow.',
    }
  }

  // Step 1: Initial request
  const initialResponse = await fetch(url, { method })

  // If not a 402, return as-is
  if (initialResponse.status !== 402) {
    const body = await safeJson(initialResponse)
    return {
      success: initialResponse.ok,
      status: initialResponse.status,
      verified: false,
      body,
    }
  }

  // Step 2: Parse the 402 challenge
  const challengeBody = await safeJson(initialResponse)
  if (!isAgentkitChallenge(402, challengeBody)) {
    return {
      success: false,
      status: 402,
      verified: false,
      body: challengeBody,
      error: 'Received 402 but no AgentKit challenge found',
    }
  }

  const challenge = parseAgentkitChallenge(challengeBody)

  // Step 3: Find a compatible chain/type for Maki's smart wallet
  const caip2 = toCaip2(config.chainId)
  const match = findCompatibleChain(challenge.supportedChains, caip2)
  if (!match) {
    return {
      success: false,
      status: 402,
      verified: false,
      body: challengeBody,
      error:
        `No compatible AgentKit verification mode found. ` +
        `Maki currently supports EIP-1271 on the active wallet chain only. ` +
        `Server supports: ${challenge.supportedChains.map((c) => `${c.chainId}/${c.type}`).join(', ')}. ` +
        `Maki wallet: ${caip2}/eip1271`,
    }
  }

  // Step 4: Get wallet address and sign
  const address = await resolveAddress(config)
  const numericChainId = parseCaip2ChainId(match.chainId)
  const siweMessage = buildSiweMessage(challenge.info, address, numericChainId)

  const signature = await signSiweMessage(config, siweMessage, challenge.info.domain)

  // Step 5: Build payload and retry
  const payload: AgentkitPayload = {
    domain: challenge.info.domain,
    address,
    uri: challenge.info.uri,
    version: challenge.info.version,
    chainId: match.chainId,
    type: match.type,
    nonce: challenge.info.nonce,
    issuedAt: challenge.info.issuedAt,
    signature,
    // Smart wallet uses EIP-1271 on-chain verification
    signatureScheme: match.type,
    statement: challenge.info.statement,
    expirationTime: challenge.info.expirationTime,
    notBefore: challenge.info.notBefore,
    requestId: challenge.info.requestId,
    resources: challenge.info.resources,
  }

  const headerValue = encodeAgentkitHeader(payload)

  const retryResponse = await fetch(url, {
    method,
    headers: { agentkit: headerValue },
  })

  const retryBody = await safeJson(retryResponse)

  return {
    success: retryResponse.ok,
    status: retryResponse.status,
    verified: retryResponse.ok,
    body: retryBody,
  }
}

/**
 * Encode the AgentKit payload as a base64 JSON string for the `agentkit` header.
 */
export function encodeAgentkitHeader(payload: AgentkitPayload): string {
  // Strip undefined values before encoding
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      clean[key] = value
    }
  }
  return Buffer.from(JSON.stringify(clean)).toString('base64')
}

/**
 * Sign a SIWE message using Maki's smart account.
 *
 * This produces a Coinbase Smart Wallet signature that can be verified
 * on-chain via EIP-1271 `isValidSignature`.
 */
async function signSiweMessage(config: AgentkitClientConfig, message: string, domain: string): Promise<string> {
  const account = await createSmartAccount(config.chainClient, config.signer, {
    signingRequest: {
      actionSummary: `Sign AgentKit verification for ${domain}`,
      actionClass: 0,
    },
  })

  const signature = await account.signMessage({ message })
  return signature
}

async function resolveAddress(config: AgentkitClientConfig): Promise<string> {
  if (config.smartAccountAddress) {
    return config.smartAccountAddress
  }

  const account = await createSmartAccount(config.chainClient, config.signer)
  return account.address
}

function findCompatibleChain(supported: SupportedChain[], walletChain: Caip2ChainId): SupportedChain | undefined {
  // Maki currently signs AgentKit challenges via its smart account only, so
  // the server must support EIP-1271 on the wallet's active chain.
  return supported.find((c) => c.chainId === walletChain && c.type === 'eip1271')
}

function parseCaip2ChainId(chainId: Caip2ChainId): SupportedChainId {
  const [, rawChainId] = chainId.split(':')
  const numericChainId = Number(rawChainId)

  if (numericChainId === 8453 || numericChainId === 84532 || numericChainId === 11155111) {
    return numericChainId
  }

  throw new Error(`Unsupported CAIP-2 chain id: ${chainId}`)
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return { text: await response.text().catch(() => '') }
  }
}
