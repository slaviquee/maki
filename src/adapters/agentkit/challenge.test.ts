import { describe, it, expect } from 'vitest'
import { parseAgentkitChallenge, buildSiweMessage, isAgentkitChallenge, AgentkitChallengeError } from './challenge.js'

const VALID_CHALLENGE_INFO = {
  domain: 'api.example.com',
  uri: 'https://api.example.com/protected',
  version: '1',
  nonce: 'abc123def456',
  issuedAt: '2025-06-01T00:00:00.000Z',
  statement: 'Verify your agent is backed by a real human',
}

const VALID_CHALLENGE_BODY = {
  agentkit: {
    info: VALID_CHALLENGE_INFO,
    supportedChains: [
      { chainId: 'eip155:84532', type: 'eip1271' },
      { chainId: 'eip155:84532', type: 'eip191' },
    ],
    mode: { type: 'free-trial', uses: 3 },
  },
}

describe('isAgentkitChallenge', () => {
  it('returns true for a 402 with agentkit extension', () => {
    expect(isAgentkitChallenge(402, VALID_CHALLENGE_BODY)).toBe(true)
  })

  it('returns false for non-402 status', () => {
    expect(isAgentkitChallenge(200, VALID_CHALLENGE_BODY)).toBe(false)
    expect(isAgentkitChallenge(401, VALID_CHALLENGE_BODY)).toBe(false)
  })

  it('returns false for 402 without agentkit extension', () => {
    expect(isAgentkitChallenge(402, { error: 'payment required' })).toBe(false)
  })

  it('returns false for non-object body', () => {
    expect(isAgentkitChallenge(402, null)).toBe(false)
    expect(isAgentkitChallenge(402, 'string')).toBe(false)
  })

  it('finds agentkit in nested x402.accepts[].extensions', () => {
    const nested = {
      x402: {
        accepts: [
          {
            scheme: 'exact',
            extensions: {
              agentkit: VALID_CHALLENGE_BODY['agentkit'],
            },
          },
        ],
      },
    }
    expect(isAgentkitChallenge(402, nested)).toBe(true)
  })
})

describe('parseAgentkitChallenge', () => {
  it('parses a valid top-level challenge', () => {
    const result = parseAgentkitChallenge(VALID_CHALLENGE_BODY)

    expect(result.info.domain).toBe('api.example.com')
    expect(result.info.uri).toBe('https://api.example.com/protected')
    expect(result.info.version).toBe('1')
    expect(result.info.nonce).toBe('abc123def456')
    expect(result.info.issuedAt).toBe('2025-06-01T00:00:00.000Z')
    expect(result.info.statement).toBe('Verify your agent is backed by a real human')
    expect(result.supportedChains).toHaveLength(2)
    expect(result.supportedChains[0]).toEqual({ chainId: 'eip155:84532', type: 'eip1271' })
    expect(result.mode).toEqual({ type: 'free-trial', uses: 3 })
  })

  it('parses a challenge nested under x402.extensions', () => {
    const nested = {
      x402: {
        extensions: {
          agentkit: VALID_CHALLENGE_BODY['agentkit'],
        },
      },
    }
    const result = parseAgentkitChallenge(nested)
    expect(result.info.domain).toBe('api.example.com')
  })

  it('throws for missing agentkit extension', () => {
    expect(() => parseAgentkitChallenge({ error: 'payment required' })).toThrow(AgentkitChallengeError)
  })

  it('throws for non-object body', () => {
    expect(() => parseAgentkitChallenge(null)).toThrow(AgentkitChallengeError)
    expect(() => parseAgentkitChallenge('string')).toThrow(AgentkitChallengeError)
  })

  it('throws for missing required info fields', () => {
    const incomplete = {
      agentkit: {
        info: { domain: 'x.com' }, // missing uri, version, nonce, issuedAt
        supportedChains: [{ chainId: 'eip155:84532', type: 'eip1271' }],
      },
    }
    expect(() => parseAgentkitChallenge(incomplete)).toThrow('Missing or invalid field')
  })

  it('throws for empty supportedChains', () => {
    const noChains = {
      agentkit: {
        info: VALID_CHALLENGE_INFO,
        supportedChains: [],
      },
    }
    expect(() => parseAgentkitChallenge(noChains)).toThrow('non-empty array')
  })

  it('handles optional info fields', () => {
    const withOptional = {
      agentkit: {
        info: {
          ...VALID_CHALLENGE_INFO,
          expirationTime: '2025-06-01T01:00:00.000Z',
          notBefore: '2025-06-01T00:00:00.000Z',
          requestId: 'req-123',
          resources: ['https://api.example.com/protected'],
        },
        supportedChains: [{ chainId: 'eip155:84532', type: 'eip1271' }],
      },
    }
    const result = parseAgentkitChallenge(withOptional)
    expect(result.info.expirationTime).toBe('2025-06-01T01:00:00.000Z')
    expect(result.info.notBefore).toBe('2025-06-01T00:00:00.000Z')
    expect(result.info.requestId).toBe('req-123')
    expect(result.info.resources).toEqual(['https://api.example.com/protected'])
  })
})

describe('buildSiweMessage', () => {
  const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

  it('builds a valid EIP-4361 SIWE message', () => {
    const message = buildSiweMessage(VALID_CHALLENGE_INFO, address, 84532)

    expect(message).toContain('api.example.com wants you to sign in with your Ethereum account:')
    expect(message).toContain(address)
    expect(message).toContain('URI: https://api.example.com/protected')
    expect(message).toContain('Version: 1')
    expect(message).toContain('Chain ID: 84532')
    expect(message).toContain('Nonce: abc123def456')
    expect(message).toContain('Issued At: 2025-06-01T00:00:00.000Z')
    expect(message).toContain('Verify your agent is backed by a real human')
  })

  it('omits optional fields when not present', () => {
    const minimal = {
      domain: 'x.com',
      uri: 'https://x.com/api',
      version: '1',
      nonce: 'n1',
      issuedAt: '2025-01-01T00:00:00.000Z',
    }
    const message = buildSiweMessage(minimal, address, 8453)

    expect(message).not.toContain('Expiration Time')
    expect(message).not.toContain('Not Before')
    expect(message).not.toContain('Request ID')
    expect(message).not.toContain('Resources')
  })

  it('includes resources when present', () => {
    const info = {
      ...VALID_CHALLENGE_INFO,
      resources: ['https://api.example.com/a', 'https://api.example.com/b'],
    }
    const message = buildSiweMessage(info, address, 84532)

    expect(message).toContain('Resources:')
    expect(message).toContain('- https://api.example.com/a')
    expect(message).toContain('- https://api.example.com/b')
  })
})
