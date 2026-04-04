---
name: uniswap
description: Uniswap swap execution. Use when the user wants to swap tokens, get swap quotes, or asks about token prices on Uniswap.
---

# Uniswap Swaps

## Workflow

1. If the user already gave an exact input amount and token pair, do not ask them to repeat it
2. Use `quote_swap` immediately to get the expected output amount
3. Present the quote to the user clearly
4. If they confirm, use `build_swap` to execute

If the user says something like:

- "Swap 0.00005 ETH to USDC"
- "Swap 25 USDC to ETH"

that is already enough to start with `quote_swap`.

Only ask a follow-up if something important is actually missing or ambiguous:

- missing exact input amount
- missing input or output token
- unclear chain
- unsupported token symbol

If the user replies later with just an amount, carry forward the previously established pair when it is unambiguous.

## Important

- Only exact-in swaps are supported (specify how much you want to sell)
- Default slippage is 0.5% (50bps). Users can adjust.
- The policy engine enforces per-tx and daily swap limits
- Swaps are medium-risk writes (action class 2) — require Touch ID
- For one-shot execution requests, quote first, then ask for explicit confirmation before executing

## Common Pairs

- ETH ↔ USDC (most liquid)
- ETH ↔ WETH
- ETH ↔ DAI
- USDC ↔ DAI

On Ethereum Sepolia, prefer:

- ETH ↔ USDC
- ETH ↔ WETH

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
- Prefer concrete tool calls over conversational back-and-forth when the user's request already contains amount + pair
