/* eslint-disable no-console */
/**
 * Minimal AgentKit demo server.
 *
 * Uses World Agent Kit to protect an endpoint with free-trial mode (3 uses).
 * Human-backed registered agents get access without payment for the first 3 uses.
 * Unverified or unregistered clients receive a 402 challenge.
 *
 * Usage:
 *   npx tsx src/agentkit-demo/server.ts
 *
 * Requires:
 *   npm install hono @hono/node-server @worldcoin/agentkit @x402/hono @x402/core @x402/evm
 */

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { createPublicClient, http } from 'viem'
import {
  declareAgentkitExtension,
  agentkitResourceServerExtension,
  createAgentkitHooks,
  createAgentBookVerifier,
  InMemoryAgentKitStorage,
} from '@worldcoin/agentkit'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/http'
import { paymentMiddlewareFromHTTPServer, x402ResourceServer, x402HTTPResourceServer } from '@x402/hono'
import { baseSepolia } from 'viem/chains'

// --- Configuration ---

const PORT = parseInt(process.env['AGENTKIT_PORT'] ?? '4021', 10)
const NETWORK = 'eip155:84532' as const // Base Sepolia for demo
const FREE_TRIAL_USES = 3
const EVM_RPC_URL = process.env['AGENTKIT_EVM_RPC_URL'] ?? 'https://sepolia.base.org'

// payTo is required by x402 but not charged in free-trial mode
const PAY_TO = '0x0000000000000000000000000000000000000001' as const

// --- AgentKit Setup ---

const agentBook = createAgentBookVerifier()
const storage = new InMemoryAgentKitStorage()
const evmVerifierClient = createPublicClient({
  chain: baseSepolia,
  transport: http(EVM_RPC_URL),
})

const hooks = createAgentkitHooks({
  storage,
  agentBook,
  mode: { type: 'free-trial', uses: FREE_TRIAL_USES },
  verifyOptions: {
    evmVerifier: evmVerifierClient.verifyMessage,
  },
  onEvent: (event) => {
    console.log(`[agentkit] ${event.type}:`, JSON.stringify(event, null, 2))
  },
})

// --- x402 Resource Server ---

const facilitatorClient = new HTTPFacilitatorClient({
  url: 'https://x402.org/facilitator',
})

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme())
  .registerExtension(agentkitResourceServerExtension)

// --- Route Configuration ---

const routes = {
  'GET /protected': {
    accepts: [
      {
        scheme: 'exact',
        price: '$0.01',
        network: NETWORK,
        payTo: PAY_TO,
      },
    ],
    extensions: declareAgentkitExtension({
      statement: 'Verify your agent is backed by a real human via World ID',
      mode: { type: 'free-trial', uses: FREE_TRIAL_USES },
    }),
  },
}

const httpServer = new x402HTTPResourceServer(resourceServer, routes).onProtectedRequest(hooks.requestHook)

// --- Hono App ---

const app = new Hono()

// Apply x402 + AgentKit middleware
app.use(paymentMiddlewareFromHTTPServer(httpServer))

// Health check (unprotected)
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    agentkit: true,
    mode: 'free-trial',
    uses: FREE_TRIAL_USES,
  }),
)

// Protected endpoint — only reachable after AgentKit verification
app.get('/protected', (c) =>
  c.json({
    message: 'Access granted — your agent is verified as human-backed',
    timestamp: new Date().toISOString(),
    note: `You have up to ${FREE_TRIAL_USES} free accesses via AgentKit free-trial mode`,
  }),
)

// --- Start ---

console.log(`AgentKit demo server starting on http://localhost:${PORT}`)
console.log(`  Health:    GET http://localhost:${PORT}/health`)
console.log(`  Protected: GET http://localhost:${PORT}/protected`)
console.log(`  Mode:      free-trial (${FREE_TRIAL_USES} uses)`)
console.log(`  Network:   ${NETWORK} (Base Sepolia)`)
console.log()
console.log('To register your agent wallet:')
console.log('  npx @worldcoin/agentkit-cli register <your-smart-account-address>')
console.log()

serve({ fetch: app.fetch, port: PORT })
