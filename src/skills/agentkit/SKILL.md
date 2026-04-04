---
name: agentkit
description: World AgentKit verification flow. Use when the user wants to test AgentKit access, verify a human-backed agent, or mentions agentkit_verify.
---

# World AgentKit

## Primary Rule

If the user says any of the following, call the AgentKit verification tool immediately:

- `agentkit_verify`
- `test agentkit access`
- `verify human-backed agent`
- `verify that maki is a human-backed agent`
- `use the AgentKit Verify tool`

Do not inspect the repo first. Do not search for the tool name in files. Do not explain the code before trying the tool.

## Default Demo Flow

- Use the local demo endpoint by default: `http://localhost:4021/protected`
- Prefer the AgentKit tool immediately
- Only ask follow-up questions if the local server is unreachable or the user explicitly wants a non-default URL

## Expected Behavior

1. Call the AgentKit verification tool
2. Let it request the protected endpoint
3. Handle the `402` challenge-response flow
4. Report whether Maki was recognized as a human-backed agent

## Safety

- Only use loopback demo origins by default
- Do not authenticate against arbitrary remote domains unless they are explicitly allowed
- This is an identity/authentication flow, not a swap/transfer flow
