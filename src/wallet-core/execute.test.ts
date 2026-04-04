import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeWriteAction, renderActionSummary, type WriteAction } from './execute.js'
import type { PolicyStore } from '../policy/store.js'
import type { SpendingTracker } from '../policy/spending-tracker.js'
import type { AuditLog } from './audit-log.js'
import type { PublicClient } from 'viem'
import { defaultPolicy } from '../policy/defaults.js'

const MOCK_FROM = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`
const MOCK_TO = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`

function createMockClient(): PublicClient {
  return {
    call: vi.fn().mockResolvedValue({ data: '0x' }),
    getCode: vi.fn().mockResolvedValue('0x'),
  } as unknown as PublicClient
}

function createMockPolicyStore(profile: 'locked' | 'balanced' | 'relaxed' = 'locked'): PolicyStore {
  const policy = defaultPolicy(profile)
  return {
    load: () => policy,
    save: vi.fn(),
  }
}

function createMockSpending(): SpendingTracker {
  return {
    record: vi.fn(),
    getDailyTotal: vi.fn().mockReturnValue(0),
    getDailyTotalAll: vi.fn().mockReturnValue({ transfer: 0, swap: 0 }),
  }
}

function createMockAuditLog(): AuditLog {
  return {
    log: vi.fn(),
    getRecent: vi.fn().mockReturnValue([]),
  }
}

function createAction(overrides: Partial<WriteAction> = {}): WriteAction {
  return {
    plan: {
      calls: [{ to: MOCK_TO }],
      description: 'Transfer 2 USDC',
      actionClass: 1,
      ...overrides.plan,
    },
    policyDetails: {
      type: 'transfer',
      recipient: MOCK_TO,
      token: 'USDC',
      amountUsdc: 2,
      ...overrides.policyDetails,
    },
  }
}

describe('renderActionSummary', () => {
  it('includes action type and risk class', () => {
    const action = createAction()
    const summary = renderActionSummary(action)
    expect(summary).toContain('Type: transfer')
    expect(summary).toContain('Risk class: 1')
    expect(summary).toContain('Steps: 1')
  })

  it('includes recipient and token', () => {
    const action = createAction()
    const summary = renderActionSummary(action)
    expect(summary).toContain(`Recipient: ${MOCK_TO}`)
    expect(summary).toContain('Token: USDC')
  })

  it('includes USDC spending-cap amount', () => {
    const action = createAction()
    const summary = renderActionSummary(action)
    expect(summary).toContain('Spend cap amount: 2.00 USDC')
  })
})

describe('executeWriteAction', () => {
  let client: PublicClient
  let policy: PolicyStore
  let spending: SpendingTracker
  let auditLog: AuditLog

  beforeEach(() => {
    client = createMockClient()
    policy = createMockPolicyStore()
    spending = createMockSpending()
    auditLog = createMockAuditLog()
  })

  it('approves a valid transfer within limits', async () => {
    const action = createAction()
    const result = await executeWriteAction(action, client, policy, MOCK_FROM, spending, auditLog)
    expect(result.status).toBe('approved')
    expect(result.actionClass).toBe(1)
    expect(result.summary).toContain('transfer')
  })

  it('does not record spending before the real signature/submission step', async () => {
    const action = createAction()
    await executeWriteAction(action, client, policy, MOCK_FROM, spending, auditLog)
    expect(spending.record).not.toHaveBeenCalled()
  })

  it('logs write_approved to audit log', async () => {
    const action = createAction()
    await executeWriteAction(action, client, policy, MOCK_FROM, spending, auditLog)
    expect(auditLog.log).toHaveBeenCalledWith('write_approved', expect.any(String), expect.any(Object))
  })

  it('denies when policy blocks', async () => {
    const action = createAction({
      policyDetails: { type: 'transfer', token: 'USDC', amountUsdc: 200 }, // exceeds 100 USDC per-tx
    })
    const result = await executeWriteAction(action, client, policy, MOCK_FROM, spending, auditLog)
    expect(result.status).toBe('denied')
    expect(result.error).toContain('per-tx limit')
  })

  it('returns simulation_failed when simulation fails', async () => {
    ;(client.call as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('execution reverted'))
    const action = createAction()
    const result = await executeWriteAction(action, client, policy, MOCK_FROM, spending, auditLog)
    expect(result.status).toBe('simulation_failed')
    expect(result.error).toContain('execution reverted')
  })

  it('still returns approved for auto-approval on relaxed profile', async () => {
    policy = createMockPolicyStore('relaxed')
    const action = createAction()
    const result = await executeWriteAction(action, client, policy, MOCK_FROM, spending, auditLog)
    expect(result.status).toBe('approved')
  })
})
