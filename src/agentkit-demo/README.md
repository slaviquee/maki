# World Agent Kit Demo

Minimal end-to-end integration of World Agent Kit with Maki. A protected local server endpoint uses AgentKit to distinguish human-backed agent wallets from unauthenticated clients, without relying on the public x402 facilitator.

## Architecture

```
Maki (agent client)                   Demo Server (Hono + AgentKit manual flow)
  |                                       |
  |-- GET /protected ------------------>  |
  |                                       |-- Check: agentkit header?
  |<-- 402 + AgentKit challenge ------   |-- No: return 402 with SIWE challenge
  |                                       |
  |-- Parse challenge                     |
  |-- Build SIWE message                  |
  |-- Sign with smart account (EIP-1271) |
  |-- Encode agentkit header              |
  |                                       |
  |-- GET /protected + agentkit header -> |
  |                                       |-- Validate message (domain, uri, nonce, time)
  |                                       |-- Verify SIWE signature (on-chain EIP-1271)
  |                                       |-- Lookup in AgentBook (configured deployment)
  |                                       |-- Check free-trial usage counter
  |<-- 200 + protected content ---------  |-- Grant access
```

## Prerequisites

1. Node.js >= 20.6.0
2. Dependencies installed: `npm install`
3. Maki signer daemon running (or mock mode for testing)

## Setup

### 1. Register your agent wallet in AgentBook

Get your Maki smart account address:

```bash
# In Maki shell, run: wallet status
# Or check your .maki/config.yaml for smartAccountAddress
```

Register with World ID:

```bash
npx @worldcoin/agentkit-cli register <your-smart-account-address>
```

This opens a QR code for World App verification. After scanning, your agent address is registered on-chain in the AgentBook contract used by the configured verifier deployment.

### 2. Start the demo server

```bash
npx tsx src/agentkit-demo/server.ts
```

The server starts on `http://localhost:4021` by default. Override with `AGENTKIT_PORT=5000`.

To use Ethereum Sepolia instead of Base Sepolia during the demo:

```bash
AGENTKIT_CHAIN_ID=11155111 npx tsx src/agentkit-demo/server.ts
```

You can also override the verifier RPC explicitly:

```bash
AGENTKIT_CHAIN_ID=11155111 AGENTKIT_EVM_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com npx tsx src/agentkit-demo/server.ts
```

### 3. Test from Maki

In the Maki shell, ask:

```
test agentkit access
```

Or use the tool directly:

```
agentkit_verify
```

By default, Maki only allows AgentKit verification against loopback demo origins such as `http://localhost:4021`. To test a remote verifier, explicitly allow its origin with `MAKI_AGENTKIT_ALLOWED_ORIGINS=https://your-demo.example`.

This calls the `agentkit_verify` tool which:

1. Hits `GET /protected`
2. Receives a 402 with an AgentKit challenge (SIWE nonce, domain, etc.)
3. Signs the SIWE message with the Maki smart wallet (EIP-1271)
4. Retries with the signed `agentkit` header
5. Reports whether access was granted

### 4. Test manually with curl

Unauthenticated request (gets 402):

```bash
curl -s http://localhost:4021/protected | jq .
```

Health check (unprotected):

```bash
curl -s http://localhost:4021/health | jq .
```

## How it works

### Server (World Agent Kit)

The server uses the official low-level AgentKit APIs:

- `parseAgentkitHeader()` — decodes the signed `agentkit` header
- `validateAgentkitMessage()` — checks domain, URI, nonce, and timing rules
- `verifyAgentkitSignature()` — verifies the smart-wallet signature on-chain
- `createAgentBookVerifier()` — verifies agent registration on-chain via the configured AgentBook deployment
- `InMemoryAgentKitStorage` — tracks per-human usage counts and nonce replay protection for the demo

This is still AgentKit, just without the public x402 facilitator in the middle. That makes the hackathon demo more reliable and easier to run locally.

### Client (Maki adapter)

Maki's AgentKit client module (`src/adapters/agentkit/`) handles:

1. **Challenge detection** — identifies 402 responses with AgentKit extensions
2. **SIWE message construction** — builds EIP-4361 messages from the challenge
3. **Smart account signing** — signs via `createSmartAccount().signMessage()` which uses the Secure Enclave P-256 key wrapped in WebAuthn format
4. **Header encoding** — base64-encodes the signed payload for the `agentkit` header
5. **Retry** — resubmits the original request with the verification header

### Signature mode

Maki uses **EIP-1271** (smart contract wallet signature verification):

- Maki's wallet is a Coinbase Smart Wallet (ERC-4337)
- The signer key lives in Apple Secure Enclave (P-256/secp256r1)
- Signatures are WebAuthn-formatted P-256 signatures
- Verification happens on-chain via the smart wallet's `isValidSignature(bytes32, bytes)`
- viem handles EIP-1271 verification automatically when calling `publicClient.verifyMessage()`
- the demo server passes `verifyOptions.evmVerifier` so smart-wallet signatures are actually checked

If the smart account is not yet deployed on-chain, EIP-6492 counterfactual verification may be needed. The current implementation uses standard EIP-1271 which requires the account to be deployed.

For demos on Ethereum Sepolia, make sure the Maki smart account has already executed at least one on-chain transaction there before testing AgentKit verification.

## Protected behavior

| Client type                                              | Result                                       |
| -------------------------------------------------------- | -------------------------------------------- |
| No `agentkit` header                                     | 402 Payment Required with AgentKit challenge |
| Valid signature, registered in AgentBook, uses remaining | 200 + protected content                      |
| Valid signature, registered, uses exhausted (>10)        | 403 (free-trial exhausted)                   |
| Valid signature, NOT registered in AgentBook             | 402 (not verified as human-backed)           |
| Invalid/expired signature                                | 402 (verification failed)                    |

## Files

| File                                      | Purpose                                     |
| ----------------------------------------- | ------------------------------------------- |
| `src/agentkit-demo/server.ts`             | Demo server with protected endpoint         |
| `src/adapters/agentkit/types.ts`          | Shared types for challenge/payload          |
| `src/adapters/agentkit/challenge.ts`      | Challenge parsing and SIWE message building |
| `src/adapters/agentkit/client.ts`         | Client for accessing protected endpoints    |
| `src/adapters/agentkit/index.ts`          | Barrel exports                              |
| `src/extensions/agentkit-tools.ts`        | Pi tool for `agentkit_verify` command       |
| `src/adapters/agentkit/challenge.test.ts` | Tests for challenge parsing                 |
| `src/adapters/agentkit/client.test.ts`    | Tests for client utilities                  |

## Demo vs production

| Aspect      | Demo                                  | Production                           |
| ----------- | ------------------------------------- | ------------------------------------ |
| Storage     | In-memory (`InMemoryAgentKitStorage`) | Database with row-level locking      |
| Network     | Base Sepolia or Ethereum Sepolia      | Production chain / dedicated config  |
| Facilitator | Not required for this local demo      | Optional depending on product design |
| Server      | Single-process Hono                   | Deployed service with proper auth    |
| Storage     | In-memory usage + nonce tracking      | Durable storage                      |
