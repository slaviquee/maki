import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encodeAgentkitHeader } from './client.js'
import type { AgentkitPayload } from './types.js'

// We test the core utilities directly; the full accessProtectedEndpoint flow
// is tested via integration tests since it requires fetch + smart account creation.

describe('encodeAgentkitHeader', () => {
  it('encodes payload as base64 JSON', () => {
    const payload: AgentkitPayload = {
      domain: 'api.example.com',
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      uri: 'https://api.example.com/protected',
      version: '1',
      chainId: 'eip155:84532',
      type: 'eip1271',
      nonce: 'abc123',
      issuedAt: '2025-06-01T00:00:00.000Z',
      signature: '0xdeadbeef',
      signatureScheme: 'eip1271',
    }

    const encoded = encodeAgentkitHeader(payload)
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))

    expect(decoded.domain).toBe('api.example.com')
    expect(decoded.address).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
    expect(decoded.chainId).toBe('eip155:84532')
    expect(decoded.type).toBe('eip1271')
    expect(decoded.signature).toBe('0xdeadbeef')
    expect(decoded.signatureScheme).toBe('eip1271')
  })

  it('strips undefined optional fields', () => {
    const payload: AgentkitPayload = {
      domain: 'x.com',
      address: '0x1234',
      uri: 'https://x.com/api',
      version: '1',
      chainId: 'eip155:8453',
      type: 'eip191',
      nonce: 'n1',
      issuedAt: '2025-01-01T00:00:00.000Z',
      signature: '0xabc',
      // All optional fields left as undefined
    }

    const encoded = encodeAgentkitHeader(payload)
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))

    expect(decoded).not.toHaveProperty('signatureScheme')
    expect(decoded).not.toHaveProperty('statement')
    expect(decoded).not.toHaveProperty('expirationTime')
    expect(decoded).not.toHaveProperty('notBefore')
    expect(decoded).not.toHaveProperty('requestId')
    expect(decoded).not.toHaveProperty('resources')
  })

  it('produces valid base64', () => {
    const payload: AgentkitPayload = {
      domain: 'test.com',
      address: '0x0000',
      uri: 'https://test.com',
      version: '1',
      chainId: 'eip155:1',
      type: 'eip191',
      nonce: 'x',
      issuedAt: '2025-01-01T00:00:00.000Z',
      signature: '0x00',
    }

    const encoded = encodeAgentkitHeader(payload)
    // Should not throw
    const raw = Buffer.from(encoded, 'base64').toString('utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.domain).toBe('test.com')
  })
})

describe('accessProtectedEndpoint', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns success for non-402 responses without challenge', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'hello' }),
    })

    // Dynamically import to get the function with mocked fetch
    const { accessProtectedEndpoint } = await import('./client.js')

    const result = await accessProtectedEndpoint(
      {
        signer: {} as never,
        chainClient: {} as never,
        chainId: 84532,
      },
      'http://localhost:4021/health',
    )

    expect(result.success).toBe(true)
    expect(result.status).toBe(200)
    expect(result.verified).toBe(false)
  })

  it('returns error when 402 has no agentkit challenge', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ error: 'payment required, no agentkit' }),
    })

    const { accessProtectedEndpoint } = await import('./client.js')

    const result = await accessProtectedEndpoint(
      {
        signer: {} as never,
        chainClient: {} as never,
        chainId: 84532,
      },
      'http://localhost:4021/protected',
    )

    expect(result.success).toBe(false)
    expect(result.status).toBe(402)
    expect(result.verified).toBe(false)
    expect(result.error).toContain('no AgentKit challenge')
  })

  it('returns error when the server does not support eip1271 on the active chain', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        agentkit: {
          info: {
            domain: 'demo.example',
            uri: 'https://demo.example/protected',
            version: '1',
            nonce: 'abc123',
            issuedAt: '2026-04-04T00:00:00.000Z',
          },
          supportedChains: [{ chainId: 'eip155:84532', type: 'eip191' }],
        },
      }),
    })

    const { accessProtectedEndpoint } = await import('./client.js')

    const result = await accessProtectedEndpoint(
      {
        signer: {} as never,
        chainClient: {} as never,
        chainId: 84532,
      },
      'http://localhost:4021/protected',
    )

    expect(result.success).toBe(false)
    expect(result.status).toBe(402)
    expect(result.verified).toBe(false)
    expect(result.error).toContain('EIP-1271 on the active wallet chain only')
  })

  it('returns error when the server only supports a different chain', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        agentkit: {
          info: {
            domain: 'demo.example',
            uri: 'https://demo.example/protected',
            version: '1',
            nonce: 'abc123',
            issuedAt: '2026-04-04T00:00:00.000Z',
          },
          supportedChains: [{ chainId: 'eip155:11155111', type: 'eip1271' }],
        },
      }),
    })

    const { accessProtectedEndpoint } = await import('./client.js')

    const result = await accessProtectedEndpoint(
      {
        signer: {} as never,
        chainClient: {} as never,
        chainId: 84532,
      },
      'http://localhost:4021/protected',
    )

    expect(result.success).toBe(false)
    expect(result.status).toBe(402)
    expect(result.verified).toBe(false)
    expect(result.error).toContain('eip155:11155111/eip1271')
  })
})
