import type { Policy, SecurityProfile } from './types.js'

const LOCKED: Policy = {
  version: 1,
  profile: 'locked',
  account: { chain: 'base-sepolia' },
  approval: {
    low_risk: 'touch_id',
    medium_risk: 'touch_id',
    high_risk: 'touch_id',
    admin: 'touch_id',
    timeout_seconds: 180,
  },
  limits: {
    transfer_per_tx_usd: 100,
    transfer_daily_usd: 300,
    swap_per_tx_usd: 200,
    swap_daily_usd: 500,
    max_slippage_bps: 50,
    max_gas_usd: 10,
  },
  allowlists: {
    recipients: [],
    protocols: ['uniswap', 'aave'],
    tokens: ['ETH', 'USDC'],
    chains: ['base'],
  },
  dangerous_actions: {
    unlimited_approvals: false,
    new_recipients: 'ask',
    new_protocols: 'ask',
    arbitrary_calldata: 'deny',
    contract_upgrades: 'deny',
    owner_changes: 'deny',
  },
  automation: {
    enabled: false,
    allowed_actions: [],
    auto_execute: false,
  },
}

const BALANCED: Policy = {
  ...LOCKED,
  profile: 'balanced',
  approval: {
    low_risk: 'touch_id',
    medium_risk: 'touch_id',
    high_risk: 'touch_id',
    admin: 'touch_id',
    timeout_seconds: 180,
  },
}

const RELAXED: Policy = {
  ...LOCKED,
  profile: 'relaxed',
  approval: {
    low_risk: 'auto',
    medium_risk: 'touch_id',
    high_risk: 'touch_id',
    admin: 'touch_id',
    timeout_seconds: 300,
  },
}

const PROFILES: Record<SecurityProfile, Policy> = {
  locked: LOCKED,
  balanced: BALANCED,
  relaxed: RELAXED,
  custom: LOCKED,
}

export function defaultPolicy(profile: SecurityProfile): Policy {
  return structuredClone(PROFILES[profile] ?? PROFILES['locked'])
}
