import { describe, expect, it } from 'vitest'
import { defaultRpcUrl, inferSetupComplete } from './setup.js'
import { defaultAllowedOrigins, normalizeWorldUrl, parseAllowedOrigins } from './world.js'

describe('setup helpers', () => {
  it('infers setup completion from explicit flag', () => {
    expect(inferSetupComplete({ setupComplete: true })).toBe(true)
    expect(inferSetupComplete({ setupComplete: false, signerType: 'secure-enclave' })).toBe(false)
  })

  it('infers existing configured installs as complete', () => {
    expect(inferSetupComplete({ signerType: 'secure-enclave' })).toBe(true)
    expect(inferSetupComplete({ bundlerApiKey: 'pim_test' })).toBe(true)
    expect(inferSetupComplete({ smartAccountAddress: '0x1234' })).toBe(true)
  })

  it('returns default RPC urls for supported chains', () => {
    expect(defaultRpcUrl(84532)).toBe('https://sepolia.base.org')
    expect(defaultRpcUrl(8453)).toBe('https://mainnet.base.org')
    expect(defaultRpcUrl(11155111)).toBe('https://ethereum-sepolia-rpc.publicnode.com')
  })

  it('normalizes World AgentKit setup values', () => {
    expect(normalizeWorldUrl('')).toBe('http://localhost:4021/protected')
    expect(parseAllowedOrigins('https://demo.example, https://second.example')).toEqual([
      'https://demo.example',
      'https://second.example',
    ])
    expect(defaultAllowedOrigins('http://localhost:4021/protected')).toEqual([])
    expect(defaultAllowedOrigins('https://demo.example/protected')).toEqual(['https://demo.example'])
  })
})
