/* eslint-disable no-console */
/**
 * Minimal AgentKit demo server using the manual verification flow.
 *
 * This intentionally avoids the public x402 facilitator so the hackathon demo
 * can run locally on Ethereum Sepolia or Base Sepolia with one clear flow:
 * 1. Maki requests /protected
 * 2. Server returns 402 + AgentKit challenge
 * 3. Maki signs the challenge with its smart wallet
 * 4. Server verifies the signature and AgentBook registration
 * 5. Human-backed agents get access to the protected response
 */

import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import {
  InMemoryAgentKitStorage,
  createAgentBookVerifier,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from '@worldcoin/agentkit'
import type { AgentkitChallenge } from '../adapters/agentkit/types.js'

const PORT = parseInt(process.env['AGENTKIT_PORT'] ?? '4021', 10)
const AGENTKIT_CHAIN_ID = parseInt(process.env['AGENTKIT_CHAIN_ID'] ?? '11155111', 10)
const NETWORK = toCaip2ChainId(AGENTKIT_CHAIN_ID)
const FREE_TRIAL_USES = 10
const EVM_RPC_URL = process.env['AGENTKIT_EVM_RPC_URL'] ?? defaultRpcUrl(AGENTKIT_CHAIN_ID)
const STATEMENT = 'Verify your agent is backed by a real human via World ID'

const storage = new InMemoryAgentKitStorage()
const agentBook = createAgentBookVerifier()

const app = new Hono()

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    agentkit: true,
    flow: 'manual',
    mode: 'free-trial',
    uses: FREE_TRIAL_USES,
    network: NETWORK,
  }),
)

app.get('/protected', async (c) => {
  const header = c.req.header('agentkit')
  const resourceUri = c.req.url

  if (!header) {
    return c.json(
      {
        error: 'AgentKit verification required',
        agentkit: buildChallenge(resourceUri),
      },
      402,
    )
  }

  let payload
  try {
    payload = parseAgentkitHeader(header)
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Invalid agentkit header',
      },
      400,
    )
  }

  const validation = await validateAgentkitMessage(payload, resourceUri, {
    checkNonce: async (nonce) => !(await storage.hasUsedNonce(nonce)),
  })

  if (!validation.valid) {
    return c.json(
      {
        error: validation.error,
      },
      401,
    )
  }

  const verification = await verifyAgentkitSignature(payload, EVM_RPC_URL)
  if (!verification.valid || !verification.address) {
    return c.json(
      {
        error: verification.error ?? 'Signature verification failed',
      },
      401,
    )
  }

  await storage.recordNonce(payload.nonce)

  const humanId = await agentBook.lookupHuman(verification.address, payload.chainId)
  if (!humanId) {
    return c.json(
      {
        error: 'Agent is not registered in AgentBook',
        address: verification.address,
      },
      403,
    )
  }

  const granted = await storage.tryIncrementUsage(c.req.path, humanId, FREE_TRIAL_USES)
  if (!granted) {
    return c.json(
      {
        error: 'Free-trial access exhausted for this human-backed agent',
        address: verification.address,
      },
      403,
    )
  }

  return c.json({
    message: 'Access granted — Maki is verified as a human-backed agent',
    verified: true,
    address: verification.address,
    humanId,
    network: NETWORK,
    timestamp: new Date().toISOString(),
  })
})

console.log(`AgentKit demo server starting on http://localhost:${PORT}`)
console.log(`  Health:    GET http://localhost:${PORT}/health`)
console.log(`  Protected: GET http://localhost:${PORT}/protected`)
console.log(`  Flow:      manual AgentKit challenge -> verify`)
console.log(`  Mode:      free-trial (${FREE_TRIAL_USES} uses)`)
console.log(`  Network:   ${NETWORK} (${chainLabel(AGENTKIT_CHAIN_ID)})`)
console.log(`  RPC:       ${EVM_RPC_URL}`)
console.log()
console.log('To register your agent wallet:')
console.log('  npx @worldcoin/agentkit-cli register <your-smart-account-address>')
console.log()

serve({ fetch: app.fetch, port: PORT })

function buildChallenge(resourceUri: string): AgentkitChallenge {
  const url = new URL(resourceUri)
  const nonce = randomBytes(16).toString('hex')

  return {
    info: {
      domain: url.hostname,
      uri: resourceUri,
      version: '1',
      nonce,
      issuedAt: new Date().toISOString(),
      statement: STATEMENT,
      resources: [resourceUri],
    },
    supportedChains: [{ chainId: NETWORK, type: 'eip1271' }],
    mode: { type: 'free-trial', uses: FREE_TRIAL_USES },
  }
}

function toCaip2ChainId(chainId: number): `eip155:${number}` {
  if (chainId === 84532 || chainId === 11155111) {
    return `eip155:${chainId}`
  }

  throw new Error(`Unsupported AGENTKIT_CHAIN_ID: ${chainId}. Supported values: 84532, 11155111`)
}

function defaultRpcUrl(chainId: number): string {
  switch (chainId) {
    case 84532:
      return 'https://sepolia.base.org'
    case 11155111:
      return 'https://ethereum-sepolia-rpc.publicnode.com'
    default:
      throw new Error(`Unsupported AGENTKIT_CHAIN_ID: ${chainId}. Supported values: 84532, 11155111`)
  }
}

function chainLabel(chainId: number): string {
  switch (chainId) {
    case 84532:
      return 'Base Sepolia'
    case 11155111:
      return 'Ethereum Sepolia'
    default:
      return `Chain ${chainId}`
  }
}
