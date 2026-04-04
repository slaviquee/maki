import { formatEther, type PublicClient, type Hex } from 'viem'
import type { PolicyStore } from '../policy/store.js'
import type { SpendingTracker } from '../policy/spending-tracker.js'
import type { AuditLog } from './audit-log.js'
import { checkAction } from '../policy/engine.js'
import type { ActionClass, ActionDetails } from '../policy/types.js'
import { simulateCallSequence } from './simulation.js'
import type { UserOpPlan } from './userop.js'

export interface WriteAction {
  plan: UserOpPlan
  policyDetails: ActionDetails
}

export interface WriteResult {
  status: 'approved' | 'submitted' | 'confirmed' | 'denied' | 'simulation_failed' | 'rejected' | 'error'
  actionClass: ActionClass
  amountUsdc?: number
  spendType?: 'transfer' | 'swap'
  summary: string
  error?: string
  userOpHash?: Hex
  txHash?: Hex
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
  if (policyDetails.amountUsdc !== undefined) {
    lines.push(`Spend cap amount: ${policyDetails.amountUsdc.toFixed(2)} USDC`)
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
 * 1. Policy check (with spending tracker for daily limits)
 * 2. Simulate (skip approval-only calls in multi-step plans)
 * 3. Render deterministic summary
 * 4. Return an approval-ready action for submission/signing
 * 5. Log to audit log
 */
export async function executeWriteAction(
  action: WriteAction,
  client: PublicClient,
  policy: PolicyStore,
  from: `0x${string}`,
  spending?: SpendingTracker,
  auditLog?: AuditLog,
): Promise<WriteResult> {
  const { plan, policyDetails } = action
  const summary = renderActionSummary(action)

  // 1. Policy check (with spending tracker for daily limits)
  const policyResult = checkAction(policy.load(), plan.actionClass, policyDetails, spending)

  if (!policyResult.allowed) {
    auditLog?.log('policy_denied', policyResult.reason, policyDetails as unknown as Record<string, unknown>)
    return {
      status: 'denied',
      actionClass: plan.actionClass,
      summary,
      error: `Policy denied: ${policyResult.reason}`,
    }
  }

  // 2. Simulate — all plans are simulated before approval.
  // Single calls use direct eth_call. Multi-call plans (e.g. approve+swap)
  // are simulated as an executeBatch on the smart account so that later calls
  // see state changes from earlier ones (e.g. the swap sees the approval).
  const simResult = await simulateCallSequence(client, from, plan.calls)

  if (!simResult.success) {
    auditLog?.log(
      'simulation_failed',
      simResult.error ?? 'Unknown',
      policyDetails as unknown as Record<string, unknown>,
    )
    return {
      status: 'simulation_failed',
      actionClass: plan.actionClass,
      summary,
      error: `Simulation failed: ${simResult.error}`,
    }
  }

  auditLog?.log('write_approved', summary, policyDetails as unknown as Record<string, unknown>)

  return {
    status: 'approved',
    actionClass: plan.actionClass,
    amountUsdc: policyDetails.amountUsdc,
    spendType: policyDetails.type === 'swap' ? 'swap' : policyDetails.type === 'transfer' ? 'transfer' : undefined,
    summary,
  }
}
