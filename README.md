# Maki

Hardware-signed onchain agent for everyday DeFi, built on Pi: deterministic execution, isolated keys, local policy guardrails, and human-backed verification.

Maki is designed around one hard rule: the model can interpret intent, but it can never directly move funds.

- Skills are prompt-only. They shape intent and UX, but never build calldata or sign.
- Tools are typed. They call deterministic wallet-core and protocol adapters, not freeform model code.
- Every write is simulated, policy-checked, and rendered as a deterministic summary before approval.
- Signing is isolated behind a separate local signer over schema-strict IPC.
- World AgentKit is integrated as a proof layer for remote agent access: Maki can prove it acts on behalf of a human-backed agent wallet.

Today:

- **Secure Enclave** is the main smart-account path
- **Ledger** is available as a hardware-backed EOA path

## Why Maki

Maki is not trying to be less capable than OpenClaw-style agents. It is trying to be narrower where that matters most: moving money onchain.

- Maki gives DeFi users the same core agentic benefit: natural-language intent, multi-step reasoning, tool use, and protocol execution.
- But it is tailored for onchain users instead of broad desktop autonomy.
- Maki is wallet-specific, not an all-powerful desktop bot.
- The execution path is first-party and deterministic.
- There is no “let the model improvise shell commands until something works” path for moving funds.
- Protocol/API responses are validated before they enter the signing pipeline.
- Local policy, human approval, and hardware-backed signing sit between the model and the chain.

Compared to OpenClaw-style agents, Maki is safer for money movement because it relies on hard boundaries, not prompt discipline alone:

- Skills in Maki do not execute. They cannot silently add a new exfiltration or shell-execution path.
- The wallet path is not exposed as arbitrary browser/file/shell authority.
- Prompt injection into content is not trusted to “behave”; the design reduces authority and narrows the blast radius instead.
- High-risk actions still terminate in a hardware-backed approval boundary, not in a broad agent runtime.

Today, Maki enforces policy locally before signing. The next step is to push the strongest controls on-chain into the smart account itself: spending limits, allowlists, automation scopes, and delayed admin actions.

## Install

```bash
npm install -g maki
```

Homebrew is the target distribution from the original spec. For now, the clean-machine path is a global npm install.

On Apple Silicon Macs, the npm package includes a prebuilt native signer. If no compatible bundled signer is available, Maki falls back to building the signer locally.

## First Run

Open one terminal for the signer:

```bash
maki signer start
```

Open a second terminal for the chat shell:

```bash
maki
```

On first launch, Maki runs a setup wizard that writes `~/.maki/config.yaml` and `~/.maki/policy.yaml`.

Maki currently supports two signer/account lanes:

- **Secure Enclave smart account**: the main ERC-4337 path
- **Ledger EOA**: a hardware-backed direct transaction path via Ledger/Speculos

Inside the chat shell:

```text
/login
Create my smart account
Check my balance
Quote swapping 0.00001 ETH to USDC
Swap 0.00001 ETH to USDC
Send 0.00001 ETH to 0x...
```

Useful security commands:

```text
/doctor
Get policy
Signer status
Get my account info
Verify that Maki is a human-backed agent
```

## Security Model

Maki follows a strict pipeline for writes:

`interpret -> resolve -> build -> simulate -> policy check -> deterministic summary -> approve -> sign -> submit`

The important part is that the LLM does not become execution truth. The model can ask for a transfer or a swap, but deterministic local code decides:

- which token/address was resolved
- which protocol/router is allowed
- what calldata gets built
- whether the action fits local policy
- what the human-readable summary says

That makes Maki much closer to a constrained transaction copilot than a broad autonomous workstation agent.

## Human Verification

World AgentKit is integrated as an optional trust layer for protected remote endpoints.

- Maki can register its wallet as a human-backed agent.
- Maki can answer an AgentKit challenge and prove that a remote request is backed by a real human, not just a script.
- This improves trust for relay, automation, and protected API flows without weakening local self-custody.

## Uniswap API Integration

Swap routing uses the [Uniswap Trading API](https://docs.uniswap.org/api/trading/overview) when configured with an API key. Phase 1 uses validated Uniswap V2/V3-backed routing.

### Setup

1. Get an API key from the [Uniswap Developer Platform](https://developers.uniswap.org/)
2. Add it to `~/.maki/config.yaml`:

```yaml
uniswapApiKey: YOUR_UNISWAP_API_KEY
```

### How it works

When `uniswapApiKey` is configured, `quote_swap` and `build_swap` use the Uniswap Trading API as the primary swap backend:

- **Quote** — `POST /quote` returns optimized routing across supported V2/V3 paths
- **Approval check** — `POST /check_approval` determines if ERC-20 approval is needed
- **Swap** — `POST /swap` returns an unsigned transaction targeting the Universal Router

All API responses are validated before entering Maki's signing pipeline:

- Swap targets must be known Uniswap Router contracts
- Chain IDs, recipients, token paths, input amounts, and min-out bounds must match the locally-resolved intent
- Approval calldata is decoded and bounded before signing
- Universal Router calldata is decoded and checked against the expected route semantics
- The full safety pipeline still applies: simulate → policy check → deterministic summary → Touch ID → sign → submit

Uses `x-permit2-disabled: true` for ERC-4337 smart account compatibility. Phase 1 supports CLASSIC, WRAP, and UNWRAP routing types. UniswapX (Dutch auction) support is deferred.

Without an API key, Maki falls back to on-chain Quoter V2 and local calldata construction.

## Policy And Limits

Maki has a single local policy center in `~/.maki/policy.yaml` covering:

- approval behavior by risk class
- per-tx and daily spending caps
- token / protocol / recipient allowlists
- dangerous-action rules
- automation permissions

These controls are enforced locally before signing. They are not on-chain smart-account limits yet. The roadmap is to push the hardest constraints on-chain so the account itself can enforce spending caps and allowlists even outside the main Maki UI.

## Notes

- Global Pi session/auth state for Maki lives in `~/.maki/agent/`
- Wallet config, policy, socket, and DB live in `~/.maki/`
- On Apple Silicon Macs, `maki signer start` uses the bundled native signer first and only falls back to a local Swift build if needed
- The first real smart-account write flow still requires a funded smart account and a bundler API key
- Ledger EOA is available for a hardware-backed direct-signing path
- World AgentKit setup can be checked with `maki world status` and `maki world register`

For the full Base Sepolia walkthrough, see [docs/first-transaction.md](docs/first-transaction.md).
