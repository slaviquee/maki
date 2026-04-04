import { describe, it, expect } from 'vitest'
import { checkAction } from './engine.js'
import { defaultPolicy } from './defaults.js'
import type { ActionDetails } from './types.js'
import type { SpendingTracker } from './spending-tracker.js'

function mockSpending(dailyTransfer = 0, dailySwap = 0): SpendingTracker {
  return {
    record: () => {},
    getDailyTotal: (type) => (type === 'transfer' ? dailyTransfer : dailySwap),
    getDailyTotalAll: () => ({ transfer: dailyTransfer, swap: dailySwap }),
  }
}

describe('checkAction', () => {
  const locked = defaultPolicy('locked')

  it('auto-allows class 0 (read-only) actions', () => {
    const result = checkAction(locked, 0, { type: 'read' })
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.approvalMode).toBe('auto')
  })

  it('always denies class 4 (forbidden) actions', () => {
    const result = checkAction(locked, 4, { type: 'admin' })
    expect(result.allowed).toBe(false)
  })

  it('requires touch_id for class 1 transfer on locked profile', () => {
    const details: ActionDetails = { type: 'transfer', token: 'ETH', amountUsd: 10 }
    const result = checkAction(locked, 1, details)
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.approvalMode).toBe('touch_id')
  })

  it('denies transfer exceeding per-tx limit', () => {
    const details: ActionDetails = { type: 'transfer', token: 'ETH', amountUsd: 200 }
    const result = checkAction(locked, 1, details)
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toContain('per-tx limit')
  })

  it('denies transfer exceeding daily limit', () => {
    const details: ActionDetails = { type: 'transfer', token: 'ETH', amountUsd: 50 }
    const spending = mockSpending(280) // $280 already spent, $50 more = $330 > $300 limit
    const result = checkAction(locked, 1, details, spending)
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toContain('Daily transfer limit')
  })

  it('allows transfer within daily limit', () => {
    const details: ActionDetails = { type: 'transfer', token: 'ETH', amountUsd: 50 }
    const spending = mockSpending(200)
    const result = checkAction(locked, 1, details, spending)
    expect(result.allowed).toBe(true)
  })

  it('denies swap exceeding per-tx limit', () => {
    const details: ActionDetails = { type: 'swap', protocol: 'uniswap', token: 'ETH', amountUsd: 300 }
    const result = checkAction(locked, 2, details)
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toContain('per-tx limit')
  })

  it('denies swap exceeding daily limit', () => {
    const details: ActionDetails = { type: 'swap', protocol: 'uniswap', token: 'ETH', amountUsd: 100 }
    const spending = mockSpending(0, 450)
    const result = checkAction(locked, 2, details, spending)
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toContain('Daily swap limit')
  })

  it('denies slippage exceeding max', () => {
    const details: ActionDetails = { type: 'swap', protocol: 'uniswap', token: 'ETH', amountUsd: 10, slippageBps: 100 }
    const result = checkAction(locked, 2, details)
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toContain('Slippage')
  })

  it('allows slippage within max', () => {
    const details: ActionDetails = { type: 'swap', protocol: 'uniswap', token: 'ETH', amountUsd: 10, slippageBps: 30 }
    const result = checkAction(locked, 2, details)
    expect(result.allowed).toBe(true)
  })

  it('denies token not in allowlist when allowlist is non-empty', () => {
    const details: ActionDetails = { type: 'transfer', token: 'SHIB' }
    const result = checkAction(locked, 1, details)
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toContain('not in allowlist')
  })

  it('allows token in allowlist', () => {
    const details: ActionDetails = { type: 'transfer', token: 'ETH', amountUsd: 10 }
    const result = checkAction(locked, 1, details)
    expect(result.allowed).toBe(true)
  })

  it('denies arbitrary calldata', () => {
    const details: ActionDetails = { type: 'arbitrary_calldata' }
    const result = checkAction(locked, 3, details)
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toContain('Arbitrary calldata')
  })

  it('auto-allows low_risk on relaxed profile', () => {
    const relaxed = defaultPolicy('relaxed')
    const details: ActionDetails = { type: 'transfer', token: 'ETH', amountUsd: 10 }
    const result = checkAction(relaxed, 1, details)
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.approvalMode).toBe('auto')
  })
})
