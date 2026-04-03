export type RecurringActionType = 'transfer' | 'swap'

export type RecurringStatus = 'active' | 'paused' | 'completed' | 'failed'

export interface RecurringAction {
  id: string
  type: RecurringActionType
  status: RecurringStatus
  params: RecurringTransferParams | RecurringSwapParams
  intervalMs: number
  nextRunAt: number
  expiresAt: number
  lastRunAt?: number
  lastError?: string
  runCount: number
  maxRuns?: number
  createdAt: number
}

export interface RecurringTransferParams {
  type: 'transfer'
  token: string // symbol
  to: string // address or ENS
  amount: string // human-readable
}

export interface RecurringSwapParams {
  type: 'swap'
  tokenIn: string
  tokenOut: string
  amountIn: string
  slippageBps: number
}
