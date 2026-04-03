---
name: aave
description: Aave V3 lending protocol. Use when the user asks about lending, borrowing, collateral, health factor, or Aave rewards.
---

# Aave V3

## Reading Positions
Use `check_aave_position` to show the user's Aave V3 position summary:
- Total collateral and debt in USD
- Available borrows
- Health factor (< 1.0 means liquidation risk)
- LTV and liquidation threshold

## Claiming Rewards
Use `claim_aave_rewards` to claim pending Aave reward tokens.
- Requires aToken addresses as input
- This is a medium-risk write (action class 2)

## Availability
- Aave V3 is only available on Base mainnet (chain ID 8453)
- Not available on Base Sepolia testnet

## Safety
- All reads are free (no gas, no approval)
- Health factor below 1.5 should be flagged as risky
- Never suggest borrowing actions in v1 — only reads and claims are supported
