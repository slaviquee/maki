---
name: portfolio
description: Portfolio reading and balance checking. Use when the user asks about balances, holdings, or portfolio overview.
---

# Portfolio

## Reading Balances
Use `get_balances` to show the user's ETH and token balances on Base.

## Checking Allowances
Use `get_allowances` to show active token approvals and which protocols can spend tokens.

## Best Practices
- Always show balances with token symbols and formatted amounts
- If balances are zero, suggest the user fund their wallet
- For testnet (Base Sepolia), suggest using a faucet
- When showing multiple tokens, list them clearly
- Use `wallet_status` first if unsure whether a wallet is configured
