# spec.md

A terminal AI agent that manages your on-chain life — swaps, transfers, protocol interactions, ENS, DeFi — with private keys locked in Apple Secure Enclave. It does everything a power user does, but no prompt can ever compromise it.

---

## One-line summary

A Pi-based local terminal AI agent that manages your on-chain life through an ERC-4337 smart account controlled by a hardware-backed local signer.

---

## Product

A terminal-first on-chain AI agent for power users, built on top of **Pi**. It should feel like Claude Code, but for web3: read balances, resolve ENS, quote and execute swaps, send tokens, inspect and revoke approvals, interact with trusted DeFi protocols, and run tightly scoped recurring actions.

The core promise: **the model can reason, but it can never own the key.**

The signing authority lives in Apple Secure Enclave on the user's laptop. The LLM interprets intent and helps orchestrate. Deterministic local code resolves assets, builds calls, simulates transactions, checks policy, and submits the final UserOperation. Sensitive actions require user approval per the user's chosen security settings.

---

## Why this should exist

On-chain power users today juggle wallets, websites, tabs, RPCs, explorers, and protocol UIs. They manually piece together multi-step flows, reason about approvals, slippage, gas, and contract risk, and trust browser extensions far too much.

This product compresses all of that into one terminal interface with strong local trust boundaries. The user gets natural language convenience, deterministic execution, local signing, configurable security, and one place for limits, allowlists, recovery, and automation rules.

---

## Core principles

1. **Brain and hand are separated.** LLM interprets and plans. Local code resolves and builds. Local signer authorizes.
2. **The agent is untrusted by default.** Prompts and model output are never treated as execution truth. Model output alone can never move funds.
3. **Read-only by default.** A fresh install cannot move funds automatically.
4. **Deterministic execution.** Protocol adapters and wallet core decide calldata and UserOperations, not freeform model output.
5. **Simulation before signing.** Every state-changing action is simulated when possible.
6. **Policy-first autonomy.** Automation is allowed only inside explicit local guardrails.
7. **One policy center.** Transaction limits, allowlists, recovery settings, approval behavior, and automation rules all live in one local policy object.
8. **Local-first.** Signer, policy, history, approvals, and audit logs live locally by default.
9. **Human legibility.** Every risky action must be rendered in plain English from deterministic execution data before approval.
10. **Pi is the shell, not the wallet.** Pi provides the terminal runtime, package system, skills, and extensions. Wallet-core, signer, policy, and execution safety remain first-party product logic.

---

## Users

**Primary:** crypto-native power users, DeFi users on Base and Ethereum, terminal-comfortable users who want local control and strong key isolation.

**Secondary:** builders and researchers, DAO operators, on-chain prosumers who hate wallet-extension UX.

---

## Goals

### v1

- Excellent terminal UX with clean Homebrew installation
- Secure local signer on macOS via Secure Enclave
- ERC-4337 smart account creation on Base
- Balances, allowances, and basic position reads
- ENS resolution
- Token transfers and exact-in swaps on Uniswap
- Approval inspection and revoke
- Optional Aave read support and simple reward claim if stable
- Simulation + clear approval flow
- Single local policy center with security profiles
- Recovery address configured during setup
- Recurring actions for a very small safe subset
- First-party Pi package with built-in extensions and skills

### Non-goals for v1

Mobile, browser extension, cross-chain bridging, advanced MEV protection, social recovery beyond one address, multi-user accounts, arbitrary protocol support, third-party plugins, fully autonomous trading, NFT trading, portfolio analytics/tax tooling, GUI-first product, remote-agent workflows.

---

## Success criteria

A user can install from terminal in under 10 minutes, create a hardware-backed signer, create a smart account on Base, set a recovery address, query balances in natural language, swap and transfer with clear approval prompts, configure security in one place, and inspect or revoke approvals.

**Security criteria:** zero blind-signing paths, every write rendered from deterministic data before signing, every write passes policy check, simulation attempted for all writes, the model never controls signing, skills never become execution truth.

---

## Hard product decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Agent shell | First-party Pi package, not a custom terminal from scratch |
| 2 | Agent model | Local-only, runs on user's laptop |
| 3 | Signer | P-256 key in Apple Secure Enclave |
| 4 | Account | ERC-4337 smart account with hardware-backed signer ownership |
| 5 | Gas | User pays gas; no sponsorship in v1 |
| 6 | Recovery | Single recovery address at setup; freeze is fast, unfreeze is slow, rotation is delayed |
| 7 | Approval | User-configurable friction via security profiles; no approval codes |
| 8 | Policy | All security controls in one local policy object |
| 9 | Distribution | Homebrew-installed system layer + first-party Pi package for extensions/skills |

---

## Trust model

**Hard rule:** the LLM must never directly access raw key material.

**Trusted:** local signer daemon, local policy engine, approval renderer, deterministic wallet core, deterministic protocol adapters, smart account contracts, local policy store.

**Conditionally trusted:** RPC providers, bundlers, price/quote sources, protocol APIs and indexers.

**Untrusted:** prompts, model output, remote model provider, arbitrary package code, unverified token/protocol metadata.

**Assumptions:** prompt injection will happen, model misunderstandings will happen, malicious token metadata exists, quote sources can be stale, adapter bugs are possible, users will occasionally approve the wrong thing unless the UI is very clear.

**Therefore:** no blind signing, no freeform calldata from the model, no policy changes without explicit user approval, no third-party adapters in v1, no skill may bypass deterministic execution checks.

---

## Architecture

### 1. Agent shell (Pi)

Terminal UX, model invocation, tool calling, streaming plans, loading extensions and skills, rendering results.

### 2. Extensions layer

Typed TypeScript extensions that register tools and commands. Expose deterministic interfaces to wallet-core and adapters. Keep the LLM away from raw signing and freeform execution.

### 3. Wallet core

Deterministic transaction and account logic: chain clients, ERC-4337 UserOperation construction, smart account deployment/detection, ENS resolution, token/account/allowance reads, simulation, submission, receipt tracking. Built with TypeScript and viem.

### 4. Local signer daemon

Native local helper exposing a strict payload schema over Unix domain socket IPC. Backend-agnostic: v1 ships Apple Secure Enclave (Swift, P-256) as the default backend. The user chooses their signer during setup; the choice determines which smart account variant is deployed (P-256 verifier for Enclave, secp256k1 verifier for hardware wallets). Everything upstream — policy, simulation, approval, submission — is identical regardless of backend. Signs only approved payloads, enforces schema checks, reads and enforces the local policy object, logs approvals locally.

### 5. Approval surface

Touch ID for all write actions. Reads need no approval, forbidden actions are denied. Security profiles control which writes auto-approve within policy, not which UI they get. All summaries are deterministic, not model-generated prose.

### 6. Policy center

Single source of truth for security configuration: profiles, per-action approval behavior, spending caps, allowlists, dangerous-action rules, automation permissions, recovery settings.

### 7. Protocol adapters

Protocol-specific deterministic modules: discover positions, quote actions, build calls, simulate, render side effects, parse receipts.

### 8. Skills

Protocol and workflow instruction packs loaded by Pi. Shape intent interpretation and UX — protocol-specific prompting, safety rails, default slippage, confirmation wording, troubleshooting. Skills never replace deterministic execution logic.

### 9. Scheduler

Local recurring job runner for supported safe actions only. Evaluates conditions per policy, simulates before execution, requests approval if required, records outcomes locally.

---

## Intent pipeline

Every user request flows through:

1. **Interpret** — classify (read / write / automation / admin), extract chain, asset, amount, recipient, protocol, constraints
2. **Resolve** — resolve ENS, tokens, protocols; fetch balances, allowances, prerequisites
3. **Plan** — produce a deterministic action plan (e.g. `approve exact amount → exactInputSingle swap`)
4. **Build** — wallet core / adapter builds exact calls or UserOperation
5. **Simulate** — dry-run when possible; predict effects, failures, output amounts
6. **Policy check** — validate against local policy; determine approval mode
7. **Render** — show deterministic summary: what happens, max spend, expected receive, slippage, approvals changed, gas cost, why approval is needed
8. **Approve** — per security profile and policy
9. **Sign** — local signer signs approved payload only
10. **Submit** — send via bundler and RPC
11. **Track** — wait for receipt, summarize result, store in local history

---

## Action classes

| Class | Examples | Approval |
|-------|----------|----------|
| 0 — read-only | Balances, allowances, positions, ENS lookups | None |
| 1 — low-risk write | Transfer to allowlisted recipient below cap, revoke approval, small swap on allowlisted protocol | Touch ID, or auto-approve if policy allows |
| 2 — medium-risk write | Larger swap within policy, claim rewards, DeFi action on allowlisted protocol | Touch ID |
| 3 — high-risk / admin | New recipient, new protocol, policy changes, allowlist edits, unfreeze, key rotation | Touch ID |
| 4 — forbidden | Arbitrary calldata from prompt, unlimited approval when forbidden, contract upgrade, owner change outside recovery | Denied |

---

## Security profiles

Profiles control which writes auto-approve within policy. All non-auto writes require Touch ID.

**Locked:** all writes require Touch ID, automation disabled, new recipients/protocols require Touch ID, unlimited approvals forbidden.

**Balanced:** small known-safe writes may auto-approve if explicitly enabled, everything else requires Touch ID, automation disabled by default.

**Relaxed:** broader within-policy auto-approval, high-risk/admin still require Touch ID, dangerous classes still forbidden.

**Custom:** user edits the policy object directly.

---

## Policy center

All security controls live in one local policy object enforced by the daemon.

**Domains:** account (chain, recovery address), approval behavior (per risk class: `auto` / `touch_id` / `deny`, timeout), limits (transfer/swap per-tx and daily caps, per-token cap, max gas, max slippage), allowlists (recipients, protocols, tokens, chains), dangerous actions (unlimited approvals, new recipients/protocols, arbitrary calldata, contract upgrades, owner changes), automation (enabled, allowed actions, caps, auto-execute).

```yaml
policy:
  profile: balanced
  account:
    chain: base
    recovery_address: "0x..."
  approval:
    low_risk: touch_id
    medium_risk: touch_id
    high_risk: touch_id
    admin: touch_id
    timeout_seconds: 180
  limits:
    transfer_per_tx_usd: 100
    transfer_daily_usd: 300
    swap_per_tx_usd: 200
    swap_daily_usd: 500
    max_slippage_bps: 50
    max_gas_usd: 10
  allowlists:
    recipients: ["alice.eth"]
    protocols: ["uniswap", "aave"]
    tokens: ["ETH", "USDC"]
    chains: ["base"]
  dangerous_actions:
    unlimited_approvals: false
    new_recipients: ask
    new_protocols: ask
    arbitrary_calldata: deny
    contract_upgrades: deny
    owner_changes: deny
  automation:
    enabled: false
    allowed_actions: ["transfer", "swap"]
    auto_execute: false
```

---

## Supported chains and protocols

**v1 chains:** Base mainnet, Base Sepolia.
**Later:** Ethereum mainnet, selected L2s.

**v1 protocols:** ENS, ERC-20 basics, Uniswap exact-in swaps, Aave read + simple reward claim.
**Later:** Morpho, Compound, Aerodrome, bridges, richer Aave actions, selected NFT support.

---

## Command surface

**Read:** balances, allowance inspection, token list, position reads, gas estimates, ENS resolution.

**Write:** transfer native/token, exact-in swap, revoke approval, claim rewards, create recurring transfer/swap within policy.

**Admin:** create smart account, switch chain, set policy/profile, manage recipients and protocol allowlist, set recovery address, freeze/unfreeze, export/import config.

---

## Extension tools

Typed interfaces exposed to the model:

`wallet_status`, `create_wallet`, `create_smart_account`, `get_balances`, `get_allowances`, `resolve_ens`, `quote_swap`, `build_swap`, `simulate_calls`, `request_signature`, `submit_userop`, `check_rewards`, `claim_rewards`, `set_recurring_transfer`, `set_security_profile`, `update_policy`

The model calls tools — it never invents calldata. Tools normalize intent, fetch facts, choose adapters, simulate, produce a typed action plan, require approval, and submit only through the signer daemon.

---

## Skills

### v1 built-in

`base-defaults`, `ens`, `portfolio`, `uniswap`, `aave`, `approvals`, `recurring-actions`

### Later

`morpho`, `aerodrome`, `nft-marketplaces`, `governance`, `bridges`

---

## CLI modes

**Interactive** (`agent`) — full TUI with streaming plans, approve/reject/modify, history and retries.

**Print** (`agent "swap 0.5 eth for usdc"`) — runs once, prints result, approval prompt when needed.

**JSON** — for scripting and automation.

**Doctor** (`agent doctor`) — checks signer, RPC, bundler, account deployment, adapters, policy validity, skills/extensions status.

---

## Setup

1. Install CLI + signer daemon via Homebrew
2. Launch agent; first-time setup runs automatically
3. Choose model/provider
4. Choose signer backend (Secure Enclave or Ledger); create key; verify local auth; show public identity
5. Create or attach ERC-4337 smart account on Base (account variant matches chosen signer curve)
6. Set recovery address (freeze is fast, unfreeze is slow, rotation is delayed)
7. Pick security profile (locked / balanced / relaxed / custom)
8. Initialize policy center with defaults
9. Install built-in skills
10. Show wallet address; prompt user to fund; verify first balance
11. Run health checks
12. Guide user through first read and first write action

**Exit criteria:** under 10 minutes, working signer, working smart account, recovery configured, profile selected, skills installed, successful query.

---

## Recurring actions

**v1 scope:** recurring transfer to allowlisted recipient, recurring exact-in swap on allowlisted protocol with hard caps.

**Rules:** disabled by default, must fit policy caps, must have expiry or review window, simulate before execution, user can pause/resume/delete, no open-ended strategy logic.

---

## Recovery and safety

Recovery address configured at setup. Freeze is fast. Unfreeze is slow and explicit. Key rotation is delayed and deliberate. Recovery actions are highly visible in UI and audit logs. Emergency local panic/freeze command available.

---

## Data and privacy

Raw private keys, approval records, audit logs, policy store, and recovery settings never leave the device in normal operation. When using a remote model, send only the minimum data needed for intent interpretation. Prefer local tools for addresses, balances, quotes, and protocol state. Approval summaries are always derived from deterministic execution data, never model prose.

---

## Error handling

Errors must be specific, never vague "transaction failed." Distinguish: model misunderstanding, unsupported intent, insufficient balance, allowance issue, simulation failure, slippage/market moved, signer unavailable, local auth cancelled, bundler failure, on-chain revert, receipt timeout, policy denial.

---

## Security requirements

**Required:** local-only signer IPC, deterministic payload schema, deterministic approval summaries, local audit log, no hidden signing, strict contract/protocol allowlists, no arbitrary calldata in normal UX, no blind approvals, unified policy center.

**Recommended:** reproducible builds for helper, signed/notarized macOS binaries, static protocol registry with checksums, simulation redundancy.

---

## Distribution

**Install:** `brew install maki`

Installs: main CLI, native signer daemon, first-party Pi package (extensions, skills, prompts), doctor/setup flow, config bootstrap in `~/.maki`.

**Updates:** CLI/helper via Homebrew, skills/extensions/prompts as Pi package versions. Protocol behavior changes versioned and surfaced in release notes.

---

## Implementation stack

| Layer | Stack |
|-------|-------|
| Shell / agent | Pi, TypeScript |
| Wallet core | TypeScript, viem, ERC-4337 client |
| Signer daemon | Backend-agnostic IPC over Unix domain socket. v1 default: Swift + Secure Enclave + LocalAuthentication. Ledger backend: @ledgerhq/hw-transport-node-hid |
| Storage | Local SQLite, encrypted config, JSON/YAML export |

---

## Sponsor integrations

Layered on top of the core product after the foundation is built. These are the last integration pass before submission — none change the architecture, they extend features that already exist in the spec. All sponsor work happens in the final build stage.

### Uniswap Foundation — Best Uniswap API Integration ($10K)

The agent already executes exact-in swaps on Uniswap. Integration: use the Uniswap Developer Platform API with a registered API key for routing and quote execution instead of hitting contracts directly. Requires: API key registration, use of their hosted routing API, submission to Uniswap Developer Feedback Form. Low effort — swap adapter calls their API instead of building routes locally.

### ENS — Best ENS Integration for AI Agents ($5K)

The agent already resolves ENS for transfers. Extension: give the agent itself an ENS identity. Register a subname (e.g. `agent.yourname.eth`), store the agent's public signer key and policy hash in ENS text records. Other agents or users can verify the agent's identity and security posture on-chain. Makes ENS not just a lookup tool but the agent's identity and discoverability layer. Also eligible for "Most Creative Use of ENS" ($5K) — using text records for signed policy attestations or rotating resolver addresses.

### Ledger — AI Agents x Ledger ($6K)

The signer daemon is already backend-agnostic. Ledger backend: user picks Ledger during setup, daemon talks to device over USB via `@ledgerhq/hw-transport-node-hid`, deploys a secp256k1-verifying smart account instead of P-256. The rest of the stack is unchanged. Ledger becomes the hardware trust layer for the AI agent — human-in-the-loop approval on a physical device. Also eligible for "Clear Signing" track ($4K) — generate ERC-7730 clear signing metadata for the transaction types the agent supports.

### World — Best use of AgentKit ($8K)

World ID adds proof-of-humanity to the agent's trust model. Integration: before high-risk actions, verify via World AgentKit that a real human (not a script) is behind the approval. Strengthens the "agent is untrusted, human is trusted" principle with cryptographic proof. Requires: World AgentKit SDK integration, World ID 4.0 verification flow. Medium effort — new dependency, but layers on top of existing approval flow without changing it.

### Chainlink — Best workflow with CRE ($4K)

The policy center needs USD-denominated price data for spending caps. A Chainlink CRE workflow could fetch price feeds and validate policy limits as an oracle-backed check before transaction submission. Lower priority — a simple price API covers the same need with less infrastructure.

---

## Build stages

### Stage 0 — Architecture spike

Prove the core trust model. Pi shell boots, signer daemon starts, local IPC works, dummy approval flow works, no on-chain actions. Exit: shell/daemon/IPC boundary stable, approval UI shape decided, config bootstrap works.

### Stage 1 — Read-only wallet

Ship a useful zero-risk version. Wallet creation, Base RPC, ENS, balances, allowances, portfolio reads, `doctor` command. Exit: fresh install works end-to-end, no write path exists. Release: internal alpha.

### Stage 2 — Signer + smart account

Real signing path. Secure Enclave signer, ERC-4337 smart account, UserOperation building, bundler submission, user-paid gas. Exit: full write transaction works on Base Sepolia, signer never exposes key material, approval flow gates all writes. Release: developer preview on testnet.

### Stage 3 — Simplest safe writes

Smallest useful write surface. Transfer native/token, approval inspect/revoke, deterministic approval summaries, basic security profiles. Exit: transfers work within policy on testnet, new-recipient flow works, revoke works.

### Stage 4 — Swaps + policy center

Uniswap exact-in swaps, full policy center, security profiles, spending caps, allowlists. Exit: swap flow works end-to-end, policy enforced consistently.

### Stage 5 — Mainnet + polish

Base mainnet deployment, Aave reads/claims if stable, recurring actions, setup wizard, Homebrew formula, audit log, error handling polish. Exit: full v1 feature set on mainnet, install-to-first-action under 10 minutes.

### Stage 6 — Sponsor integrations

Final pass. Uniswap API key + Developer Platform routing, ENS agent identity via subnames and text records, Ledger signer backend, World ID verification, Chainlink price feeds if time allows. See sponsor integrations section for details per track.
