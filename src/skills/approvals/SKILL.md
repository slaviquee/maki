---
name: approvals
description: Token approval inspection and revocation. Use when the user asks about approvals, allowances, or wants to revoke permissions.
---

# Token Approvals

## Checking Approvals
Use `get_allowances` to show all active token approvals for the wallet.

## Revoking Approvals
Use `revoke_approval` to set an allowance to 0 for a specific spender.

## Best Practices
- Always show current allowances before suggesting revokes
- Explain what each approval means (which protocol can spend which token)
- Flag unlimited approvals as higher risk
- Revoking is a low-risk write (action class 1)
- After revoking, the protocol can no longer spend that token on the user's behalf
