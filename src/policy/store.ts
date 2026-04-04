import { readFileSync, writeFileSync } from 'node:fs'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { z } from 'zod'
import type { Policy } from './types.js'
import { defaultPolicy } from './defaults.js'

const ApprovalModeSchema = z.enum(['auto', 'touch_id', 'deny'])
const DangerousActionModeSchema = z.enum(['ask', 'deny'])

const PolicySchema = z.object({
  version: z.literal(1),
  profile: z.enum(['locked', 'balanced', 'relaxed', 'custom']),
  account: z.object({
    chain: z.enum(['base', 'base-sepolia', 'ethereum-sepolia']),
    recovery_address: z.string().startsWith('0x').optional(),
  }),
  approval: z.object({
    low_risk: ApprovalModeSchema,
    medium_risk: ApprovalModeSchema,
    high_risk: ApprovalModeSchema,
    admin: ApprovalModeSchema,
    timeout_seconds: z.number().positive(),
  }),
  limits: z.object({
    transfer_per_tx_usdc: z.number().nonnegative(),
    transfer_daily_usdc: z.number().nonnegative(),
    swap_per_tx_usdc: z.number().nonnegative(),
    swap_daily_usdc: z.number().nonnegative(),
    max_slippage_bps: z.number().nonnegative(),
    max_gas_usd: z.number().nonnegative(),
  }),
  allowlists: z.object({
    recipients: z.array(z.string()),
    protocols: z.array(z.string()),
    tokens: z.array(z.string()),
    chains: z.array(z.string()),
  }),
  dangerous_actions: z.object({
    unlimited_approvals: z.boolean(),
    new_recipients: DangerousActionModeSchema,
    new_protocols: DangerousActionModeSchema,
    arbitrary_calldata: z.literal('deny'),
    contract_upgrades: z.literal('deny'),
    owner_changes: z.literal('deny'),
  }),
  automation: z.object({
    enabled: z.boolean(),
    allowed_actions: z.array(z.string()),
    auto_execute: z.boolean(),
  }),
})

export interface PolicyStore {
  load(): Policy
  save(policy: Policy): void
}

function normalizeLegacyPolicy(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    return raw
  }

  const policy = { ...(raw as Record<string, unknown>) }
  const limits = policy['limits']
  if (!limits || typeof limits !== 'object') {
    return policy
  }

  const normalizedLimits = { ...(limits as Record<string, unknown>) }

  if (normalizedLimits['transfer_per_tx_usdc'] === undefined && normalizedLimits['transfer_per_tx_usd'] !== undefined) {
    normalizedLimits['transfer_per_tx_usdc'] = normalizedLimits['transfer_per_tx_usd']
  }
  if (normalizedLimits['transfer_daily_usdc'] === undefined && normalizedLimits['transfer_daily_usd'] !== undefined) {
    normalizedLimits['transfer_daily_usdc'] = normalizedLimits['transfer_daily_usd']
  }
  if (normalizedLimits['swap_per_tx_usdc'] === undefined && normalizedLimits['swap_per_tx_usd'] !== undefined) {
    normalizedLimits['swap_per_tx_usdc'] = normalizedLimits['swap_per_tx_usd']
  }
  if (normalizedLimits['swap_daily_usdc'] === undefined && normalizedLimits['swap_daily_usd'] !== undefined) {
    normalizedLimits['swap_daily_usdc'] = normalizedLimits['swap_daily_usd']
  }

  delete normalizedLimits['transfer_per_tx_usd']
  delete normalizedLimits['transfer_daily_usd']
  delete normalizedLimits['swap_per_tx_usd']
  delete normalizedLimits['swap_daily_usd']

  policy['limits'] = normalizedLimits
  return policy
}

export function createPolicyStore(policyPath: string): PolicyStore {
  return {
    load(): Policy {
      try {
        const raw = normalizeLegacyPolicy(yamlParse(readFileSync(policyPath, 'utf-8')))
        const result = PolicySchema.safeParse(raw)
        if (result.success) {
          return result.data as Policy
        }
        console.warn('Policy validation failed, using defaults:', result.error.message)
        return defaultPolicy('locked')
      } catch {
        return defaultPolicy('locked')
      }
    },

    save(policy: Policy): void {
      const result = PolicySchema.safeParse(policy)
      if (!result.success) {
        throw new Error(`Invalid policy: ${result.error.message}`)
      }
      writeFileSync(policyPath, yamlStringify(policy), 'utf-8')
    },
  }
}
