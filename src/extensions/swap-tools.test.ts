import { describe, expect, it } from 'vitest'
import { ensureSwapSupportedInAccountMode } from './swap-tools.js'
import type { UserOpCall } from '../wallet-core/userop.js'

function makeCall(overrides: Partial<UserOpCall> = {}): UserOpCall {
  return {
    to: '0x1111111111111111111111111111111111111111',
    value: 0n,
    data: '0x',
    ...overrides,
  }
}

describe('ensureSwapSupportedInAccountMode', () => {
  it('allows single-call swaps in Ledger EOA demo mode', () => {
    expect(() => ensureSwapSupportedInAccountMode('eoa-demo', [makeCall()])).not.toThrow()
  })

  it('rejects multi-call swaps in Ledger EOA demo mode', () => {
    expect(() => ensureSwapSupportedInAccountMode('eoa-demo', [makeCall(), makeCall()])).toThrow(
      'single-call swaps only',
    )
  })

  it('allows multi-call swaps in smart-account mode', () => {
    expect(() => ensureSwapSupportedInAccountMode('smart-account', [makeCall(), makeCall()])).not.toThrow()
  })
})
