---
name: recurring-actions
description: Recurring transfers and swaps. Use when the user wants to set up scheduled or repeating on-chain actions.
---

# Recurring Actions

## Creating

Use `create_recurring_transfer` to set up a repeating token transfer.

## Managing

Use `list_recurring_actions` to view all scheduled actions.
Use `manage_recurring_action` to pause, resume, or delete.

## Rules

- Automation must be enabled in the policy (disabled by default in locked profile)
- All recurring actions must fit within policy spending caps
- Each action has an expiry date (default 30 days)
- Optional max run count for finite schedules
- Only transfers and swaps are supported in v1

## Safety

- Recurring actions are simulated before each execution
- Policy limits are checked at execution time, not just creation
- If an execution fails, the action is marked as failed
- Users can pause or delete at any time
