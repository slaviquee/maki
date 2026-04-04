import type { ActionClass, ActionDetails, ApprovalMode, Policy, PolicyDecision } from './types.js'
import type { SpendingTracker } from './spending-tracker.js'

const CLASS_TO_APPROVAL_KEY: Record<ActionClass, keyof Policy['approval'] | null> = {
  0: null,
  1: 'low_risk',
  2: 'medium_risk',
  3: 'admin',
  4: null,
}

export function checkAction(
  policy: Policy,
  actionClass: ActionClass,
  details: ActionDetails,
  spending?: SpendingTracker,
): PolicyDecision {
  // Class 0: read-only, always allowed
  if (actionClass === 0) {
    return { allowed: true, approvalMode: 'auto' }
  }

  // Class 4: forbidden, always denied
  if (actionClass === 4) {
    return { allowed: false, reason: 'Action class 4 (forbidden) is always denied' }
  }

  // Check dangerous actions
  if (details.type === 'arbitrary_calldata' && policy.dangerous_actions.arbitrary_calldata === 'deny') {
    return { allowed: false, reason: 'Arbitrary calldata is forbidden by policy' }
  }

  // Check token allowlist
  if (details.token && policy.allowlists.tokens.length > 0) {
    if (!policy.allowlists.tokens.includes(details.token)) {
      return { allowed: false, reason: `Token ${details.token} not in allowlist` }
    }
  }

  // Check new recipient
  if (details.recipient && policy.allowlists.recipients.length > 0) {
    if (!policy.allowlists.recipients.includes(details.recipient)) {
      if (policy.dangerous_actions.new_recipients === 'deny') {
        return {
          allowed: false,
          reason: `Recipient ${details.recipient} not in allowlist and new recipients are denied`,
        }
      }
      // 'ask' mode: escalate to higher risk class (touch_id)
    }
  }

  // Check protocol allowlist
  if (details.protocol && policy.allowlists.protocols.length > 0) {
    if (!policy.allowlists.protocols.includes(details.protocol)) {
      if (policy.dangerous_actions.new_protocols === 'deny') {
        return { allowed: false, reason: `Protocol ${details.protocol} not in allowlist and new protocols are denied` }
      }
    }
  }

  // Check per-transaction spending limits
  if (details.amountUsd !== undefined) {
    if (details.type === 'transfer' && details.amountUsd > policy.limits.transfer_per_tx_usd) {
      return {
        allowed: false,
        reason: `Transfer $${details.amountUsd.toFixed(2)} exceeds per-tx limit of $${policy.limits.transfer_per_tx_usd}`,
      }
    }
    if (details.type === 'swap' && details.amountUsd > policy.limits.swap_per_tx_usd) {
      return {
        allowed: false,
        reason: `Swap $${details.amountUsd.toFixed(2)} exceeds per-tx limit of $${policy.limits.swap_per_tx_usd}`,
      }
    }
  }

  // Check daily spending limits
  if (spending && details.amountUsd !== undefined) {
    if (details.type === 'transfer') {
      const dailyTotal = spending.getDailyTotal('transfer')
      if (dailyTotal + details.amountUsd > policy.limits.transfer_daily_usd) {
        return {
          allowed: false,
          reason: `Daily transfer limit exceeded: $${dailyTotal.toFixed(2)} spent + $${details.amountUsd.toFixed(2)} > $${policy.limits.transfer_daily_usd} limit`,
        }
      }
    }
    if (details.type === 'swap') {
      const dailyTotal = spending.getDailyTotal('swap')
      if (dailyTotal + details.amountUsd > policy.limits.swap_daily_usd) {
        return {
          allowed: false,
          reason: `Daily swap limit exceeded: $${dailyTotal.toFixed(2)} spent + $${details.amountUsd.toFixed(2)} > $${policy.limits.swap_daily_usd} limit`,
        }
      }
    }
  }

  // Check slippage for swaps
  if (details.type === 'swap' && details.slippageBps !== undefined) {
    if (details.slippageBps > policy.limits.max_slippage_bps) {
      return {
        allowed: false,
        reason: `Slippage ${details.slippageBps}bps exceeds max allowed ${policy.limits.max_slippage_bps}bps`,
      }
    }
  }

  // Get approval mode for this action class
  const key = CLASS_TO_APPROVAL_KEY[actionClass]
  if (!key) {
    return { allowed: false, reason: `Unknown action class ${actionClass}` }
  }

  const approvalMode = policy.approval[key] as ApprovalMode
  if (approvalMode === 'deny') {
    return { allowed: false, reason: `Action class ${actionClass} is denied by policy` }
  }

  return { allowed: true, approvalMode }
}
