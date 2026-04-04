import { concat, sha256, type Hex } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { createWebAuthnAccount, normalizeP256Signature, normalizeWebAuthnPublicKey } from './webauthn-adapter.js'

describe('normalizeWebAuthnPublicKey', () => {
  it('strips the SEC1 uncompressed prefix for WebAuthn owners', () => {
    const prefixedKey =
      '0x04f61dbf33259a56705e77c7c9de87261c6750edfeea548527f73a8c4adf3550551ccfb6cf5b1b847252abb2f874f088493f4b6ce508885b6b860928d403c3eeca'

    expect(normalizeWebAuthnPublicKey(prefixedKey)).toBe(
      '0xf61dbf33259a56705e77c7c9de87261c6750edfeea548527f73a8c4adf3550551ccfb6cf5b1b847252abb2f874f088493f4b6ce508885b6b860928d403c3eeca',
    )
  })

  it('leaves already-normalized x||y keys unchanged', () => {
    const normalizedKey =
      '0xf61dbf33259a56705e77c7c9de87261c6750edfeea548527f73a8c4adf3550551ccfb6cf5b1b847252abb2f874f088493f4b6ce508885b6b860928d403c3eeca'

    expect(normalizeWebAuthnPublicKey(normalizedKey)).toBe(normalizedKey)
  })

  it('rejects malformed key lengths', () => {
    expect(() => normalizeWebAuthnPublicKey('0x1234')).toThrow('Invalid WebAuthn public key length')
  })
})

describe('createWebAuthnAccount', () => {
  it('signs the WebAuthn assertion digest and emits minimal assertion metadata', async () => {
    const signHash = vi.fn().mockResolvedValue({
      approved: true,
      signature: ('0x' + '11'.repeat(32) + '22'.repeat(32)) as Hex,
    })

    const account = createWebAuthnAccount(
      {
        signHash,
      } as never,
      '0x04f61dbf33259a56705e77c7c9de87261c6750edfeea548527f73a8c4adf3550551ccfb6cf5b1b847252abb2f874f088493f4b6ce508885b6b860928d403c3eeca',
      'maki-enclave-key',
    )

    const hash = `0x${'11'.repeat(32)}` as Hex
    const assertion = await account.sign({ hash })

    const challenge = Buffer.from(hash.slice(2), 'hex').toString('base64url')
    const clientDataJSON = JSON.stringify({
      type: 'webauthn.get',
      challenge,
    })
    const authenticatorData = ('0x' + '00'.repeat(32) + '05' + '00000000') as Hex
    const clientDataJSONHash = sha256(`0x${Buffer.from(clientDataJSON, 'utf8').toString('hex')}` as Hex)
    const expectedDigest = sha256(concat([authenticatorData, clientDataJSONHash]))

    expect(signHash).toHaveBeenCalledWith({
      hash: expectedDigest,
      actionSummary: 'Sign message',
      actionClass: 1,
    })

    expect(assertion.webauthn.authenticatorData).toBe(authenticatorData)
    expect(assertion.webauthn.clientDataJSON).toBe(clientDataJSON)
    expect(assertion.webauthn.clientDataJSON).not.toContain('origin')
    expect(account.publicKey).toBe(
      '0xf61dbf33259a56705e77c7c9de87261c6750edfeea548527f73a8c4adf3550551ccfb6cf5b1b847252abb2f874f088493f4b6ce508885b6b860928d403c3eeca',
    )
  })
})

describe('normalizeP256Signature', () => {
  it('normalizes high-s signatures into the low-s form expected by webauthn-sol', () => {
    const highSSignature = '0x' + '11'.repeat(32) + 'ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632550'

    expect(normalizeP256Signature(highSSignature)).toBe(
      '0x' + '11'.repeat(32) + '0000000000000000000000000000000000000000000000000000000000000001',
    )
  })
})
