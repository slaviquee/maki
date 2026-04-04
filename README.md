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

## Notes

- Global Pi session/auth state for Maki lives in `~/.maki/agent/`
- Wallet config, policy, socket, and DB live in `~/.maki/`
- The native signer daemon is built on demand the first time you run `maki signer start`
- The first real write flow still requires a funded smart account and a bundler API key

For the full Base Sepolia walkthrough, see [docs/first-transaction.md](docs/first-transaction.md).
