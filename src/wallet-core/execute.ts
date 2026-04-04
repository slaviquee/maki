import { formatEther, type PublicClient, keccak256, toBytes } from 'viem'
import type { SignerClient } from '../signer/types.js'
import type { PolicyStore } from '../policy/store.js'
import type { SpendingTracker } from '../policy/spending-tracker.js'
import type { AuditLog } from './audit-log.js'
import { checkAction } from '../policy/engine.js'
import type { ActionDetails } from '../policy/types.js'
import { simulateCall } from './simulation.js'
import type { UserOpPlan } from './userop.js'

export interface WriteAction {
  plan: UserOpPlan
  policyDetails: ActionDetails
}

export interface WriteResult {
  status: 'approved' | 'denied' | 'simulation_failed' | 'rejected' | 'error'
  summary: string
  error?: string
  /** Populated when approved. Caller must record this after on-chain confirmation. */
  pendingSpend?: { type: 'transfer' | 'swap'; amountUsd: number }
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
 * 1. Policy check (with spending tracker for daily limits)
 * 2. Simulate (skip approval-only calls in multi-step plans)
 * 3. Render deterministic summary
 * 4. Request Touch ID approval via signHash (not the no-op approveAction)
 * 5. Log to audit log
 */
export async function executeWriteAction(
  action: WriteAction,
  client: PublicClient,
  signer: SignerClient,
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
      summary,
      error: `Policy denied: ${policyResult.reason}`,
    }
  }

  // 2. Simulate — single-call plans are simulated directly via eth_call.
  // Multi-call plans (e.g. approve+swap) cannot be simulated individually
  // because later calls depend on state changes from earlier ones. These
  // rely on the bundler's full UserOp simulation at submission time.
  if (plan.calls.length === 1) {
    const call = plan.calls[0]!
    const simResult = await simulateCall(client, from, {
      to: call.to,
      data: call.data,
      value: call.value,
    })

    if (!simResult.success) {
      auditLog?.log(
        'simulation_failed',
        simResult.error ?? 'Unknown',
        policyDetails as unknown as Record<string, unknown>,
      )
      return {
        status: 'simulation_failed',
        summary,
        error: `Simulation failed: ${simResult.error}`,
      }
    }
  }
  // Multi-call plans: simulation deferred to bundler UserOp validation

  // 3. Request approval via signHash (real Touch ID, not the no-op approveAction)
  if (policyResult.approvalMode === 'touch_id') {
    // Hash the summary deterministically for the signer to approve
    const approvalHash = keccak256(toBytes(summary))

    const signResult = await signer.signHash({
      hash: approvalHash as `0x${string}`,
      actionSummary: summary,
      actionClass: plan.actionClass,
    })

    if (!signResult.approved) {
      auditLog?.log('user_rejected', summary, policyDetails as unknown as Record<string, unknown>)
      return {
        status: 'rejected',
        summary,
        error: 'User rejected the action',
      }
    }
  }

  // 4. Log approval (spending is NOT recorded here — must be recorded after
  // on-chain confirmation to avoid burning daily budget on unsubmitted actions)
  auditLog?.log('write_approved', summary, policyDetails as unknown as Record<string, unknown>)

  const pendingSpend =
    policyDetails.amountUsd !== undefined
      ? {
          type: (policyDetails.type === 'swap' ? 'swap' : 'transfer') as 'transfer' | 'swap',
          amountUsd: policyDetails.amountUsd,
        }
      : undefined

  return {
    status: 'approved',
    summary,
    pendingSpend,
  }
}
