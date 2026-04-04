---
name: base-defaults
description: Default context for Base and Ethereum Sepolia operations. Safety rails, common addresses, and chain-specific conventions.
---

# Chain Defaults

## Chain Context

- Base is an L2 built on the OP Stack, settling to Ethereum mainnet
- Ethereum Sepolia is the canonical Ethereum L1 testnet
- Chain IDs: 8453 (Base mainnet), 84532 (Base Sepolia), 11155111 (Ethereum Sepolia)
- Native token is ETH on all supported chains
- USDC is the dominant stablecoin on Base; Ethereum Sepolia also has testnet USDC liquidity on Uniswap
- Gas fees are typically under $0.01

## Safety Rails

- Always resolve ENS names before using them as addresses
- Always check balances before suggesting transfers or swaps
- Never construct raw calldata — use the typed wallet tools
- Never suggest the user paste private keys or seed phrases
- When in doubt about an address, ask the user to confirm
- All write actions require approval — never bypass this
- If a user already gave a concrete amount and asset pair for a swap, do not ask them to restate it

## Common Tokens on Base Mainnet

- ETH (native gas token)
- WETH: 0x4200000000000000000000000000000000000006
- USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- DAI: 0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb
- cbETH: 0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22

## Common Tokens on Base Sepolia

- ETH (native gas token)
- WETH: 0x4200000000000000000000000000000000000006
- USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

## Common Tokens on Ethereum Sepolia

- ETH (native gas token)
- WETH: 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14
- USDC: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238

## Interaction Style

- When a request already contains amount + token pair, start with the relevant read-only tool instead of asking a redundant clarification
- For swaps, the normal flow is: quote first, then explicit user confirmation, then execute
