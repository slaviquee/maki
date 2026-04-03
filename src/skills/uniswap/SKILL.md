---
name: uniswap
description: Uniswap swap execution. Use when the user wants to swap tokens, get swap quotes, or asks about token prices on Uniswap.
---

# Uniswap Swaps

## Workflow
1. Use `quote_swap` to get the expected output amount
2. Present the quote to the user clearly
3. If they confirm, use `build_swap` to execute

## Important
- Only exact-in swaps are supported (specify how much you want to sell)
- Default slippage is 0.5% (50bps). Users can adjust.
- The policy engine enforces per-tx and daily swap limits
- Swaps are medium-risk writes (action class 2) — require Touch ID

## Common Pairs on Base
- ETH ↔ USDC (most liquid)
- ETH ↔ DAI
- USDC ↔ DAI

## Fee Tiers
- 0.01% (100) — stablecoin pairs
- 0.05% (500) — most common for major pairs
- 0.30% (3000) — standard
- 1.00% (10000) — exotic pairs

The quoter automatically finds the best fee tier.

## Slippage
- 0.5% (50bps) is the default and works for most swaps
- Volatile markets may need higher slippage (100-200bps)
- The policy enforces max_slippage_bps — swaps exceeding this are denied

## Safety
- Token addresses come from the verified registry, never from user input
- The swap router address is hardcoded per chain
- Approval is set to exact amount, never unlimited
