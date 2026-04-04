---
name: base-defaults
description: Default context for Base chain operations. Safety rails, common addresses, and chain-specific conventions.
---

# Base Defaults

## Chain Context

- Base is an L2 built on the OP Stack, settling to Ethereum mainnet
- Chain ID 8453 (mainnet), 84532 (Sepolia testnet)
- Native token is ETH (bridged from L1)
- USDC is the dominant stablecoin on Base
- Gas fees are typically under $0.01

## Safety Rails

- Always resolve ENS names before using them as addresses
- Always check balances before suggesting transfers or swaps
- Never construct raw calldata — use the typed wallet tools
- Never suggest the user paste private keys or seed phrases
- When in doubt about an address, ask the user to confirm
- All write actions require approval — never bypass this

## Common Tokens on Base

- ETH (native gas token)
- WETH: 0x4200000000000000000000000000000000000006
- USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- DAI: 0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb
- cbETH: 0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22
