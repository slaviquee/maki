import { describe, it, expect } from 'vitest'
import { getUsdcSpendingCapAmount } from './spending-cap.js'

describe('getUsdcSpendingCapAmount', () => {
  it('returns the numeric amount for USDC', () => {
    expect(getUsdcSpendingCapAmount('USDC', '12.5')).toBe(12.5)
  })

  it('returns undefined for non-USDC assets', () => {
    expect(getUsdcSpendingCapAmount('ETH', '1')).toBeUndefined()
    expect(getUsdcSpendingCapAmount('DAI', '25')).toBeUndefined()
  })

  it('returns undefined for malformed amounts', () => {
    expect(getUsdcSpendingCapAmount('USDC', 'not-a-number')).toBeUndefined()
  })
})
