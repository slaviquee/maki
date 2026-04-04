import { describe, expect, it } from 'vitest'
import { findToken, getTokenRegistry } from './tokens.js'

describe('token registry', () => {
  it('includes native ETH on Base Sepolia', () => {
    const token = findToken(84532, 'ETH')
    expect(token).toBeDefined()
    expect(token?.address).toBe('0x0000000000000000000000000000000000000000')
    expect(token?.decimals).toBe(18)
  })

  it('includes WETH on Base Sepolia', () => {
    const token = findToken(84532, 'WETH')
    expect(token).toBeDefined()
    expect(token?.address).toBe('0x4200000000000000000000000000000000000006')
  })

  it('finds tokens by address as well as symbol', () => {
    const token = findToken(84532, '0x036CbD53842c5426634e7929541eC2318f3dCF7e')
    expect(token?.symbol).toBe('USDC')
  })

  it('returns a registry containing ETH and USDC on Base Sepolia', () => {
    const registry = getTokenRegistry(84532).map((token) => token.symbol)
    expect(registry).toEqual(expect.arrayContaining(['ETH', 'USDC', 'WETH']))
  })

  it('includes ETH, WETH, and USDC on Ethereum Sepolia', () => {
    const registry = getTokenRegistry(11155111).map((token) => token.symbol)
    expect(registry).toEqual(expect.arrayContaining(['ETH', 'USDC', 'WETH']))
    expect(findToken(11155111, 'WETH')?.address).toBe('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14')
    expect(findToken(11155111, 'USDC')?.address).toBe('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
  })
})
