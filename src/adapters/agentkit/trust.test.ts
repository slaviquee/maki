import { describe, expect, it } from 'vitest'
import { validateTrustedAgentkitUrl } from './trust.js'

describe('validateTrustedAgentkitUrl', () => {
  it('allows the local demo server by default', () => {
    expect(validateTrustedAgentkitUrl('http://localhost:4021/protected')).toEqual({
      ok: true,
      origin: 'http://localhost:4021',
    })
  })

  it('rejects arbitrary remote origins by default', () => {
    const result = validateTrustedAgentkitUrl('https://evil.example/protected')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('untrusted origin')
  })

  it('allows explicitly allowlisted origins', () => {
    expect(validateTrustedAgentkitUrl('https://demo.example/protected', 'https://demo.example')).toEqual({
      ok: true,
      origin: 'https://demo.example',
    })
  })
})
