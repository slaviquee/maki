# Maki

Terminal AI agent for on-chain life — swaps, transfers, DeFi, ENS — with private keys locked in Apple Secure Enclave. Built on Pi as the shell runtime. TypeScript + viem + ERC-4337.

## Architecture

The core invariant: **the LLM interprets intent; it never touches keys or builds raw calldata.** Three boundaries enforce this:

1. **Agent shell (Pi)** — terminal UX, model invocation, tool calling, streaming. The LLM lives here.
2. **Wallet core + protocol adapters** — deterministic TypeScript modules that resolve assets, build calls, simulate, and construct UserOperations. The LLM calls typed tools that delegate here.
3. **Signer daemon** — native process (Swift/Secure Enclave) exposing a strict schema over Unix domain socket IPC. Signs only policy-checked, schema-valid payloads. The LLM has zero access to this.

Key directories:
- `src/extensions/` — Pi extensions that register typed tools for the model
- `src/wallet-core/` — chain clients, ERC-4337 UserOp construction, ENS, token reads, simulation
- `src/adapters/` — protocol-specific modules (Uniswap, Aave, ERC-20)
- `src/policy/` — local policy engine, security profiles, spending caps, allowlists
- `src/signer/` — IPC client for the native signer daemon
- `signer-daemon/` — Swift native helper (Secure Enclave backend)
- `src/skills/` — Pi skill packs (prompt shaping, safety rails, protocol-specific UX)
- `docs/` — spec and design docs

## Commands

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm run test         # run test suite
npm run lint         # eslint + prettier check
npm run lint:fix     # auto-fix lint issues
npm run typecheck    # tsc --noEmit
```

For the Swift signer daemon: `cd signer-daemon && swift build`

## Code Style

- TypeScript strict mode, no `any` types — use `unknown` and narrow
- 2-space indentation, single quotes, no semicolons (prettier handles this)
- Prefer `viem` over ethers.js for all chain interactions
- Use barrel exports (`index.ts`) per module directory
- Error types: use discriminated unions, not thrown strings
- Async: always propagate errors explicitly, no swallowed promises

## Security Invariants — IMPORTANT

These are non-negotiable. Every PR must preserve them:

1. **Model output is untrusted.** Never use LLM output as calldata, addresses, amounts, or signing input. Model output flows through typed tool interfaces → deterministic resolution → policy check → signer.
2. **No blind signing.** Every write action renders a deterministic human-readable summary from execution data before requesting approval. Never from model prose.
3. **Policy gates all writes.** The signer daemon reads and enforces the local policy object. No code path bypasses policy.
4. **Simulation before signing.** Attempt simulation for every state-changing UserOperation. Surface failures clearly.
5. **Signer IPC is schema-strict.** The daemon accepts only typed payload schemas over the Unix socket. Reject anything else.
6. **Skills shape intent, never execution.** Skills are prompt/UX packs. They never construct calldata or bypass deterministic checks.

## Intent Pipeline

Every user request follows: Interpret → Resolve → Plan → Build → Simulate → Policy check → Render summary → Approve (Touch ID) → Sign → Submit → Track receipt.

Action risk classes: 0 (read-only, no approval) → 1 (low-risk write) → 2 (medium write) → 3 (high-risk/admin) → 4 (forbidden, always denied).

## Testing Conventions

- Unit tests colocated: `foo.test.ts` next to `foo.ts`
- Integration tests in `tests/integration/`
- Mock the signer daemon IPC for wallet-core tests
- Mock RPC responses with recorded fixtures for adapter tests
- Every protocol adapter needs: quote accuracy test, calldata construction test, simulation test, receipt parsing test
- Policy engine tests must cover all risk classes and profile combinations

## Common Gotchas

- The signer daemon is a separate native process — it must be running for any write tests. Use the mock IPC client in unit tests.
- ERC-4337 UserOperations require a bundler. Use a local bundler for dev (Alto or Stackup) or mock the submission layer.
- viem's `encodeFunctionData` is strict about ABI types — always use const assertions on ABI arrays.
- Base Sepolia for testnet, Base mainnet for prod. Chain config lives in the policy object.
- Token metadata (decimals, symbols) must come from verified on-chain reads or a pinned registry, never from user input or model output.

## Git Workflow

- Branch naming: `feat/`, `fix/`, `refactor/`, `docs/` prefixes
- Commit messages: imperative mood, concise (e.g., "Add swap simulation to Uniswap adapter")
- PRs require: passing CI, typecheck, lint, tests, and a security review for anything touching signer/policy/adapter code

## Stack Reference

| Layer | Tech |
|-------|------|
| Shell | Pi runtime, TypeScript |
| Wallet core | viem, permissionless (ERC-4337) |
| Signer | Swift, Apple Secure Enclave, LocalAuthentication |
| Signer IPC | Unix domain socket, JSON schema |
| Storage | SQLite (local), YAML (policy export) |
| Target chains | Base mainnet, Base Sepolia |
| Protocols (v1) | Uniswap, Aave, ENS, ERC-20 |
