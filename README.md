# Maki

Terminal AI agent for on-chain life: balances, swaps, transfers, approvals, and Base smart-account signing with Apple Secure Enclave.

## Install

```bash
npm install -g maki
```

Homebrew is the target distribution from the original spec. For now, the clean-machine path is a global npm install.

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

Inside the chat shell:

```text
/login
Create my smart account
Check my balance
Quote swapping 0.00001 ETH to USDC
Swap 0.00001 ETH to USDC
Send 0.00001 ETH to 0x...
```

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

## Notes

- Global Pi session/auth state for Maki lives in `~/.maki/agent/`
- Wallet config, policy, socket, and DB live in `~/.maki/`
- The native signer daemon is built on demand the first time you run `maki signer start`
- The first real write flow still requires a funded smart account and a bundler API key

For the full Base Sepolia walkthrough, see [docs/first-transaction.md](docs/first-transaction.md).
