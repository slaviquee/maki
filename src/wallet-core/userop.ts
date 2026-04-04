import type { Hex } from 'viem'
import type { SmartAccount } from 'viem/account-abstraction'

export interface UserOpCall {
  to: `0x${string}`
  data?: Hex
  value?: bigint
}

export interface UserOpPlan {
  calls: UserOpCall[]
  description: string
  actionClass: 0 | 1 | 2 | 3 | 4
}

/**
 * Encodes calls into smart account calldata.
 */
export async function encodeUserOpCalls(account: SmartAccount, calls: UserOpCall[]): Promise<Hex> {
  return account.encodeCalls(
    calls.map((c) => ({
      to: c.to,
      data: c.data ?? '0x',
      value: c.value ?? 0n,
    })),
  )
}

/**
 * Renders a human-readable summary of a UserOp plan.
 * This is deterministic — never from model prose.
 */
export function renderUserOpSummary(plan: UserOpPlan): string {
  const lines = [`Action: ${plan.description}`, `Risk class: ${plan.actionClass}`, `Steps: ${plan.calls.length}`]

  for (let i = 0; i < plan.calls.length; i++) {
    const call = plan.calls[i]!
    lines.push(`  ${i + 1}. Call ${call.to}${call.value ? ` (value: ${call.value})` : ''}`)
  }

  return lines.join('\n')
}
