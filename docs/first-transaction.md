# First Base Sepolia Transaction

Step-by-step runbook for making your first real transaction from Maki on Base Sepolia.

## Prerequisites

- macOS with Touch ID (Secure Enclave support)
- Node.js >= 20.6.0
- Xcode command-line tools (for Swift signer daemon build)
- A Pimlico API key (free tier at [pimlico.io](https://pimlico.io))
- A Uniswap API key (free at [developers.uniswap.org](https://developers.uniswap.org/)) — for optimized swap routing
- Small amount of Base Sepolia ETH (faucet: [faucet.base.org](https://www.base.org/faucet) or similar)

## 1. Install Maki

```bash
npm install -g maki
```

## 2. Run first-time setup

Launch Maki once:

```bash
maki
```

On first launch, Maki runs a setup wizard and writes `~/.maki/config.yaml` and `~/.maki/policy.yaml`.

During setup:
- pick Base Sepolia
- choose `secure-enclave`
- enter your Pimlico API key
- choose a security profile

Model/provider login still happens inside the chat shell via `/login`.

## 3. Start the signer daemon

In a separate terminal:

```bash
maki signer start
```

This builds and ad-hoc signs the native helper if needed, then starts the Secure Enclave signer on `~/.maki/signer.sock`.

Keep this terminal open while you use Maki.

## 4. Verify config

Your config should look roughly like this:

```bash
# ~/.maki/config.yaml
chainId: 84532
rpcUrl: 'https://sepolia.base.org'
signerType: secure-enclave
bundlerApiKey: YOUR_PIMLICO_API_KEY
uniswapApiKey: YOUR_UNISWAP_API_KEY
```

Required fields for a real transaction:
- `signerType: secure-enclave` (not `mock`)
- `bundlerApiKey`: your Pimlico API key (get one at pimlico.io, free tier includes Base Sepolia)
- `uniswapApiKey`: your Uniswap API key (get one at developers.uniswap.org) — enables optimized swap routing via the Uniswap Trading API

## 5. Create your smart account

Launch Maki and log in to a model if needed:

```text
/login
```

Then ask it to create a smart account:

```
> Create my smart account
```

This calls `create_smart_account`, which:
1. Requests a P-256 key from the Secure Enclave (Touch ID prompt)
2. Computes the counterfactual Coinbase Smart Wallet address
3. Saves the address to `~/.maki/config.yaml`

The account is **counterfactual** — the address is known, but no on-chain contract exists yet. Deployment happens atomically with the first transaction.

## 6. Fund the account

Send a small amount of Base Sepolia ETH to the counterfactual address shown in step 4.

- Use a faucet or send from another wallet
- 0.01 ETH is more than enough for testing
- The account doesn't need to be deployed to receive ETH

Verify the balance:

```
> Check my balance
```

## 7. Send a tiny transfer

```
> Send 0.001 ETH to 0xYOUR_TEST_RECIPIENT_ADDRESS
```

This triggers the full pipeline:
1. **Resolve** — validates the recipient address
2. **Build** — constructs a native ETH transfer call
3. **Simulate** — skipped for counterfactual accounts (bundler validates)
4. **Policy check** — verifies limits, allowlists, approval mode
5. **Summary** — renders deterministic summary from execution data
6. **Approve** — Touch ID prompt via Secure Enclave signer
7. **Submit** — sends UserOperation via Pimlico bundler (includes initCode to deploy account)
8. **Confirm** — waits for on-chain receipt

On success, you'll see the transaction hash and UserOperation hash.

## What to expect on first transaction

The first transaction is special because it deploys the smart account:
- The UserOperation includes `initCode` that deploys a Coinbase Smart Wallet v1.1
- The owner is the Secure Enclave P-256 key wrapped as a WebAuthn account
- Gas costs are higher than subsequent transactions (deployment overhead)
- Pimlico sponsors gas on Base Sepolia (testnet), so the account balance covers only the transfer value

## Troubleshooting

### "Signer daemon not available"
The daemon isn't running or the socket path doesn't match. Check:
```bash
ls -la ~/.maki/signer.sock
```
Restart the daemon if needed.

### "Live submission blocked: signer is in mock mode"
Your `config.yaml` has `signerType: mock` or the daemon wasn't reachable at startup. Fix the config and restart.

### "No bundlerApiKey in config"
Add your Pimlico API key to `~/.maki/config.yaml`.

### "AA21 out of gas" or similar AA errors
The account may not have enough ETH, or gas estimation failed. Fund with more testnet ETH and retry.

### "Policy denied"
Check `~/.maki/policy.yaml`. The default locked profile allows ETH and USDC transfers up to $100/tx.

## Verification checklist

- [ ] Setup wizard completed on first launch
- [ ] Signer daemon running with Secure Enclave backend
- [ ] `config.yaml` has `signerType: secure-enclave` and `bundlerApiKey`
- [ ] Smart account created and address saved
- [ ] Account funded with Base Sepolia ETH
- [ ] `doctor` command shows all green
- [ ] Touch ID prompt appeared during send
- [ ] Transaction confirmed with tx hash
