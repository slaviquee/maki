# Ledger Integration

Maki supports Ledger-backed signing as an alternate trust layer alongside Apple Secure Enclave. In this hackathon build, the supported Ledger path is the official Speculos emulator. The AI agent interprets intent, simulates, and explains, and the Ledger stack remains the approval boundary.

## Account Modes

Maki has two distinct account modes:

| Mode | Signer | Account Type | Execution | Bundler Required |
|------|--------|-------------|-----------|-----------------|
| **Secure Enclave** | P-256 / Touch ID | ERC-4337 Smart Account | UserOperations via bundler | Yes |
| **Ledger EOA demo** | secp256k1 / Ledger device | Direct EOA | Normal Ethereum transactions | No |

The Ledger EOA demo mode uses the Ledger-derived Ethereum address directly. Transactions are signed on the Ledger device and broadcast as normal Ethereum transactions — no ERC-4337 bundler or smart account is involved.

### Why EOA demo mode?

The Coinbase Smart Wallet's signature verification path does not yet align cleanly with the Ledger signer kit for on-chain validation. Rather than shipping a half-broken smart-account flow, Ledger EOA demo mode provides a clean, working end-to-end path where:

- Maki still interprets, simulates, explains, and policy-gates all actions
- The Ledger device is the hardware trust layer
- Clear-signing is strongest here — the Ledger device shows raw transaction details
- The Secure Enclave smart-account path remains the full-featured production path

## Architecture

The Ledger integration preserves all of Maki's security invariants:

- **Model output is untrusted** — the LLM never touches keys, calldata, or signing
- **No blind signing** — transaction details are shown in the terminal from deterministic execution data
- **Policy gates all writes** — Ledger transactions go through the same policy engine
- **Simulation before signing** — every transaction is simulated before reaching the device
- **Schema-strict IPC** — the Ledger signer speaks the same Unix socket protocol as the Secure Enclave daemon

### How It Works (EOA Demo)

```
User intent
  -> LLM interprets (typed tools)
    -> Deterministic resolution (wallet-core/adapters)
      -> Build transaction call
        -> Simulate (eth_call)
          -> Policy check
            -> Render deterministic summary
              -> IPC to Ledger signer -> Ledger device confirmation
                -> Sign raw transaction -> Broadcast -> Track receipt
```

The Ledger signer is a TypeScript/Node process that:

1. Listens on the same Unix domain socket (`~/.maki/signer.sock`)
2. Speaks the same JSON-over-newline IPC protocol
3. Uses the official Ledger Device Management Kit (DMK) to communicate with the device
4. Supports the Speculos emulator via Ledger's official HTTP transport

## Setup

### 1. Run the setup wizard

```bash
maki setup
```

Choose:

- Signer backend: **[2] Ledger**
- Derivation path: default `44'/60'/0'/0/0`
- Speculos host/port: defaults to `127.0.0.1:5000`

The wizard automatically sets `ledger.accountMode: eoa-demo`.

### 2. Start the signer

#### Speculos emulator (no hardware needed)

First, start Speculos in a separate terminal:

```bash
# Install Speculos if needed
pip install speculos

# Run with the Ethereum app
speculos --model nanosp path/to/app-ethereum/build/nanosp/bin/app.elf
```

Then start the Maki signer:

```bash
maki signer start
```

### 3. Use Maki

```bash
maki
```

In the chat:

- "Setup my ledger account" — fetches EOA address from device, saves it
- "Check my balance"
- "Send 0.001 ETH to 0x..." — confirm on Ledger device
- `/doctor` — shows Ledger EOA mode status

## Supported Actions (Ledger EOA Demo)

| Action | Supported | Notes |
|--------|-----------|-------|
| Native ETH transfer | Yes | Direct EOA transaction |
| ERC-20 transfer | Yes | Direct EOA transaction |
| Balance checks | Yes | Read-only, no signing |
| Simulation | Yes | eth_call preflight |
| Policy gating | Yes | Same policy engine |
| Multi-call batching | No | EOA = single call per tx |
| Swaps (Uniswap) | Partial | Single-step swaps only (no approve+swap batching) |
| Aave | No | Requires smart account batching |
| Gas sponsorship | No | Requires bundler/paymaster |

## Config

In `~/.maki/config.yaml`:

```yaml
signerType: ledger
ledgerAddress: '0x...'  # Set by setup_ledger_account
ledger:
  transport: speculos
  derivationPath: "44'/60'/0'/0/0"
  speculosHost: '127.0.0.1'
  speculosPort: 5000
  accountMode: eoa-demo
```

The `ledgerAddress` field is separate from `smartAccountAddress` — neither interferes with the other.

## Signing Modes

| Method | Ledger Display | Use Case |
|--------|---------------|----------|
| `sign_transaction` | Shows transaction details | Primary EOA demo path |
| `sign_personal_message` | Shows message on device | Auth flows |
| `sign_typed_data` | Shows structured EIP-712 data | Reserved for future use |
| `sign_hash` | Not supported | Fails closed |

## Official Packages Used

| Package | Version | Purpose |
|---------|---------|---------|
| `@ledgerhq/context-module` | ^1.15.0 | Ledger context/clear-signing module required by signer kit |
| `@ledgerhq/device-management-kit` | ^1.2.0 | Core DMK — device discovery, connection, session management |
| `@ledgerhq/device-signer-kit-ethereum` | ^1.13.0 | Ethereum signer — getAddress, signMessage, signTransaction |
| `@ledgerhq/device-transport-kit-speculos` | ^1.2.0 | Speculos emulator transport |
| `rxjs` | 7.8.2 | DMK peer dependency |

## Health Checks

Run `/doctor` in Maki to check:

- Signer daemon connectivity
- Speculos session connectivity
- Ethereum app open status
- Account mode (EOA demo vs smart account)
- Derived address

## Demo Flow

1. **Start Speculos**
2. **`maki signer start`** — connects to device, shows address
3. **`maki`** — launches chat with "Ledger EOA" in status bar
4. **"Setup my ledger account"** — fetches and saves EOA address
5. **Fund the address** with testnet ETH (Ethereum Sepolia)
6. **"Send 0.001 ETH to 0x..."** — shows deterministic summary, confirm on device
7. **`/doctor`** — shows full health status including Ledger EOA mode

## What Is Not Supported (Deferred)

- ERC-4337 smart account with Ledger owner (signature verification mismatch)
- Physical USB Ledger transport (stable DMK/HID package versions do not align yet)
- Ledger Live integration
- Multi-device management
- Ledger Recover
- Non-Ethereum apps
- Multi-call transaction batching in EOA mode
- Gas sponsorship in EOA mode
