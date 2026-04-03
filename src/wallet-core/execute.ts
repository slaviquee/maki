import { formatEther, formatUnits, type PublicClient } from 'viem'
import type { SmartAccount } from 'viem/account-abstraction'
import type { SignerClient } from '../signer/types.js'
import type { PolicyStore } from '../policy/store.js'
import { checkAction } from '../policy/engine.js'
import type { ActionClass, ActionDetails } from '../policy/types.js'
import { simulateCall } from './simulation.js'
import type { UserOpCall, UserOpPlan } from './userop.js'

export interface WriteAction {
  plan: UserOpPlan
  policyDetails: ActionDetails
}

export interface WriteResult {
  status: 'approved' | 'denied' | 'simulation_failed' | 'rejected' | 'error'
  summary: string
  error?: string
}

/**
 * Renders a deterministic human-readable summary of a write action.
 * This is NEVER from model prose — always from execution data.
 */
export function renderActionSummary(action: WriteAction): string {
  const { plan, policyDetails } = action
  const lines: string[] = []

  lines.push(`--- Action Summary ---`)
  lines.push(`Type: ${policyDetails.type}`)

  if (policyDetails.recipient) {
    lines.push(`Recipient: ${policyDetails.recipient}`)
  }
  if (policyDetails.protocol) {
    lines.push(`Protocol: ${policyDetails.protocol}`)
  }
  if (policyDetails.token) {
    lines.push(`Token: ${policyDetails.token}`)
  }
  if (policyDetails.amountUsd !== undefined) {
    lines.push(`Est. value: ~$${policyDetails.amountUsd.toFixed(2)}`)
  }

  lines.push(`Risk class: ${plan.actionClass}`)
  lines.push(`Steps: ${plan.calls.length}`)

  for (let i = 0; i < plan.calls.length; i++) {
    const call = plan.calls[i]!
    const parts = [`  ${i + 1}. Call ${call.to}`]
    if (call.value && call.value > 0n) {
      parts.push(`(${formatEther(call.value)} ETH)`)
    }
    lines.push(parts.join(' '))
  }

  lines.push(`---------------------`)
  return lines.join('\n')
}

/**
 * Executes the full write pipeline:
 * 1. Policy check
 * 2. Simulate
 * 3. Render summary
 * 4. Request approval via signer
 * 5. Return result (actual signing/submission is handled by the caller)
 */
export async function executeWriteAction(
  action: WriteAction,
  client: PublicClient,
  signer: SignerClient,
  policy: PolicyStore,
  from: `0x${string}`,
): Promise<WriteResult> {
  const { plan, policyDetails } = action

  // 1. Policy check
  const policyResult = checkAction(policy.load(), plan.actionClass, policyDetails)

  if (!policyResult.allowed) {
    return {
      status: 'denied',
      summary: renderActionSummary(action),
      error: `Policy denied: ${policyResult.reason}`,
    }
  }

  // 2. Simulate each call
  for (const call of plan.calls) {
    const simResult = await simulateCall(client, from, {
      to: call.to,
      data: call.data,
      value: call.value,
    })

    if (!simResult.success) {
      return {
        status: 'simulation_failed',
        summary: renderActionSummary(action),
        error: `Simulation failed: ${simResult.error}`,
      }
    }
  }

  // 3. Render summary
  const summary = renderActionSummary(action)

  // 4. Request approval
  if (policyResult.approvalMode === 'touch_id') {
    const approval = await signer.approveAction({
      summary,
      actionClass: plan.actionClass,
      details: policyDetails as unknown as Record<string, unknown>,
    })

    if (!approval.approved) {
      return {
        status: 'rejected',
        summary,
        error: approval.reason ?? 'User rejected',
      }
    }
  }

  // 5. Approved — caller will handle signing and submission
  return {
    status: 'approved',
    summary,
  }
}
