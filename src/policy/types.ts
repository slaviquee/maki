export type SecurityProfile = 'locked' | 'balanced' | 'relaxed' | 'custom'

export type ActionClass = 0 | 1 | 2 | 3 | 4

export type ApprovalMode = 'auto' | 'touch_id' | 'deny'

export interface ApprovalConfig {
  low_risk: ApprovalMode
  medium_risk: ApprovalMode
  high_risk: ApprovalMode
  admin: ApprovalMode
  timeout_seconds: number
}

export interface SpendingLimits {
  transfer_per_tx_usdc: number
  transfer_daily_usdc: number
  swap_per_tx_usdc: number
  swap_daily_usdc: number
  max_slippage_bps: number
  max_gas_usd: number
}

export interface Allowlists {
  recipients: string[]
  protocols: string[]
  tokens: string[]
  chains: string[]
}

export type DangerousActionMode = 'ask' | 'deny'

export interface DangerousActions {
  unlimited_approvals: boolean
  new_recipients: DangerousActionMode
  new_protocols: DangerousActionMode
  arbitrary_calldata: 'deny'
  contract_upgrades: 'deny'
  owner_changes: 'deny'
}

export interface AutomationConfig {
  enabled: boolean
  allowed_actions: string[]
  auto_execute: boolean
}

export interface AccountConfig {
  chain: 'base' | 'base-sepolia' | 'ethereum-sepolia'
  recovery_address?: `0x${string}`
}

export interface Policy {
  version: 1
  profile: SecurityProfile
  account: AccountConfig
  approval: ApprovalConfig
  limits: SpendingLimits
  allowlists: Allowlists
  dangerous_actions: DangerousActions
  automation: AutomationConfig
}

export interface ActionDetails {
  type: string
  recipient?: string
  protocol?: string
  token?: string
  amountUsdc?: number
  slippageBps?: number
}

export type PolicyDecision = { allowed: true; approvalMode: ApprovalMode } | { allowed: false; reason: string }
