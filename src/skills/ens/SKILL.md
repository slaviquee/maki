---
name: ens
description: ENS name resolution. Use when the user mentions .eth names, wants to look up addresses, or before transfers to ENS recipients.
---

# ENS Resolution

## Usage

Use the `resolve_ens` tool to resolve .eth names to addresses and vice versa.

## Important

- ENS resolution happens on Ethereum mainnet, not Base
- Always resolve ENS names before using them as transaction recipients
- Reverse resolution: given an address, you can look up its ENS name
- Some ENS names may not have addresses set — always check the result
- Names are normalized automatically (case-insensitive)

## Examples

- "what's vitalik.eth's address?" → resolve_ens with name: "vitalik.eth"
- "who is 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045?" → resolve_ens with address
