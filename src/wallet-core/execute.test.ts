import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeWriteAction, renderActionSummary, type WriteAction } from './execute.js'
import type { SignerClient } from '../signer/types.js'
import type { PolicyStore } from '../policy/store.js'
import type { SpendingTracker } from '../policy/spending-tracker.js'
import type { AuditLog } from './audit-log.js'
import type { PublicClient } from 'viem'
import { defaultPolicy } from '../policy/defaults.js'

const MOCK_FROM = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`
const MOCK_TO = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`

function createMockSigner(): SignerClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    ping: vi.fn().mockResolvedValue({ pong: true, version: '0.1.0-test' }),
    status: vi.fn().mockResolvedValue({ ready: true, signerType: 'mock', hasKey: true }),
    getPublicKey: vi
      .fn()
      .mockResolvedValue({ publicKey: '0x04' + 'ab'.repeat(32) + 'cd'.repeat(32), address: MOCK_FROM }),
    getPublicKeyCoordinates: vi.fn().mockResolvedValue({ x: '0x' + 'ab'.repeat(32), y: '0x' + 'cd'.repeat(32) }),
    createKey: vi.fn().mockResolvedValue({ publicKey: '0x04', x: '0x', y: '0x', created: true }),
    signHash: vi.fn().mockResolvedValue({ signature: ('0x' + 'ff'.repeat(64)) as `0x${string}`, approved: true }),
    approveAction: vi.fn().mockResolvedValue({ approved: true }),
  }
}

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
      calls: [{ to: MOCK_TO, value: 1000000000000000n }],
      description: 'Send 0.001 ETH',
      actionClass: 1,
      ...overrides.plan,
    },
    policyDetails: {
      type: 'transfer',
      recipient: MOCK_TO,
      token: 'ETH',
      amountUsd: 2,
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
    expect(summary).toContain('Token: ETH')
  })

  it('includes USD estimate', () => {
    const action = createAction()
    const summary = renderActionSummary(action)
    expect(summary).toContain('Est. value: ~$2.00')
  })
})

describe('executeWriteAction', () => {
  let signer: SignerClient
  let client: PublicClient
  let policy: PolicyStore
  let spending: SpendingTracker
  let auditLog: AuditLog

  beforeEach(() => {
    signer = createMockSigner()
    client = createMockClient()
    policy = createMockPolicyStore()
    spending = createMockSpending()
    auditLog = createMockAuditLog()
  })

  it('approves a valid transfer within limits', async () => {
    const action = createAction()
    const result = await executeWriteAction(action, client, signer, policy, MOCK_FROM, spending, auditLog)
    expect(result.status).toBe('approved')
    expect(result.summary).toContain('transfer')
  })

  it('calls signHash for touch_id approval', async () => {
    const action = createAction()
    await executeWriteAction(action, client, signer, policy, MOCK_FROM, spending, auditLog)
    expect(signer.signHash).toHaveBeenCalledOnce()
  })

  it('records spending after approval', async () => {
    const action = createAction()
    await executeWriteAction(action, client, signer, policy, MOCK_FROM, spending, auditLog)
    expect(spending.record).toHaveBeenCalledWith('transfer', 2)
  })

  it('logs write_approved to audit log', async () => {
    const action = createAction()
    await executeWriteAction(action, client, signer, policy, MOCK_FROM, spending, auditLog)
    expect(auditLog.log).toHaveBeenCalledWith('write_approved', expect.any(String), expect.any(Object))
  })

  it('denies when policy blocks', async () => {
    const action = createAction({
      policyDetails: { type: 'transfer', token: 'ETH', amountUsd: 200 }, // exceeds $100 per-tx
    })
    const result = await executeWriteAction(action, client, signer, policy, MOCK_FROM, spending, auditLog)
    expect(result.status).toBe('denied')
    expect(result.error).toContain('per-tx limit')
  })

  it('returns rejected when user denies signing', async () => {
    ;(signer.signHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      signature: '0x' as `0x${string}`,
      approved: false,
    })
    const action = createAction()
    const result = await executeWriteAction(action, client, signer, policy, MOCK_FROM, spending, auditLog)
    expect(result.status).toBe('rejected')
  })

  it('returns simulation_failed when simulation fails', async () => {
    ;(client.call as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('execution reverted'))
    const action = createAction()
    const result = await executeWriteAction(action, client, signer, policy, MOCK_FROM, spending, auditLog)
    expect(result.status).toBe('simulation_failed')
    expect(result.error).toContain('execution reverted')
  })

  it('skips signHash for auto-approval on relaxed profile', async () => {
    policy = createMockPolicyStore('relaxed')
    const action = createAction()
    const result = await executeWriteAction(action, client, signer, policy, MOCK_FROM, spending, auditLog)
    expect(result.status).toBe('approved')
    expect(signer.signHash).not.toHaveBeenCalled()
  })
})
