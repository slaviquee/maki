import { describe, it, expect, vi } from 'vitest'
import { submitApproved } from './submit-helper.js'
import type { WriteResult } from '../wallet-core/execute.js'
import type { MakiContext, SignerMode } from './context.js'

function createMockContext(overrides: { signerMode?: SignerMode; bundlerApiKey?: string } = {}): MakiContext {
  return {
    config: {
      chainId: 84532,
      rpcUrl: 'https://sepolia.base.org',
      socketPath: '/tmp/test.sock',
      policyPath: '/tmp/policy.yaml',
      configPath: '/tmp/config.yaml',
      dbPath: '/tmp/maki.db',
      signerType: 'secure-enclave',
      smartAccountAddress: '0x1234567890abcdef1234567890abcdef12345678',
      bundlerApiKey: overrides.bundlerApiKey,
    },
    signer: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      ping: vi.fn(),
      status: vi.fn(),
      getPublicKey: vi.fn(),
      getPublicKeyCoordinates: vi.fn(),
      createKey: vi.fn(),
      signHash: vi.fn(),
      approveAction: vi.fn(),
    },
    signerMode: overrides.signerMode ?? 'secure-enclave',
    policy: { load: vi.fn(), save: vi.fn() },
    chainClient: {} as MakiContext['chainClient'],
    spending: { record: vi.fn(), getDailyTotal: vi.fn(), getDailyTotalAll: vi.fn() },
    auditLog: { log: vi.fn(), getRecent: vi.fn().mockReturnValue([]) },
  }
}

const approvedResult: WriteResult = {
  status: 'approved',
  actionClass: 1,
  summary: 'Test action summary',
}

describe('submitApproved', () => {
  it('blocks submission when signer is in mock mode', async () => {
    const ctx = createMockContext({ signerMode: 'mock' })
    const result = await submitApproved(ctx, [], approvedResult)
    expect(result.status).toBe('approved') // stays approved, not submitted
    expect(result.error).toContain('mock mode')
  })

  it('blocks submission when signer is in mock-fallback mode', async () => {
    const ctx = createMockContext({ signerMode: 'mock-fallback' })
    const result = await submitApproved(ctx, [], approvedResult)
    expect(result.error).toContain('mock-fallback mode')
  })

  it('blocks submission when bundlerApiKey is missing', async () => {
    const ctx = createMockContext({ signerMode: 'secure-enclave' })
    const result = await submitApproved(ctx, [], approvedResult)
    expect(result.error).toContain('bundlerApiKey')
  })
})
