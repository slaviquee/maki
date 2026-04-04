import {
  concat,
  sha256,
  type Hex,
  hashMessage,
  hashTypedData,
  type SignableMessage,
  type TypedDataDefinition,
} from 'viem'
import type { WebAuthnAccount, WebAuthnSignReturnType } from 'viem/account-abstraction'
import type { SignerClient } from '../signer/types.js'

/**
 * Bridges the maki signer daemon (Secure Enclave P-256) to viem's WebAuthnAccount interface.
 *
 * The Coinbase Smart Wallet expects WebAuthn-formatted P-256 signatures.
 * This adapter constructs minimal but valid WebAuthn structures around
 * the raw Secure Enclave signature.
 */
export function createWebAuthnAccount(signer: SignerClient, publicKeyHex: Hex, credentialId: string): WebAuthnAccount {
  const normalizedPublicKey = normalizeWebAuthnPublicKey(publicKeyHex)

  async function signWithWebAuthn(hash: Hex): Promise<WebAuthnSignReturnType> {
    // Construct the same minimal WebAuthn assertion payload used by
    // OpenZeppelin/Coinbase testing helpers for raw P-256 signers.
    const challenge = Buffer.from(hash.slice(2), 'hex').toString('base64url')

    // rpIdHash (32 bytes zeros) + flags (0x05 = UP+UV) + counter (4 bytes zeros)
    const authenticatorData = ('0x' + '00'.repeat(32) + '05' + '00000000') as Hex

    const clientDataJSON = JSON.stringify({
      type: 'webauthn.get',
      challenge,
    })

    const clientDataJSONHash = sha256(hexFromUtf8(clientDataJSON))
    const webAuthnDigest = sha256(concat([authenticatorData, clientDataJSONHash]))

    const result = await signer.signHash({
      hash: webAuthnDigest,
      actionSummary: 'Sign message',
      actionClass: 1,
    })

    if (!result.approved) {
      throw new Error('Signing rejected by user')
    }

    const normalizedSignature = normalizeP256Signature(result.signature)

    const typeIndex = clientDataJSON.indexOf('"type"')
    const challengeIndex = clientDataJSON.indexOf('"challenge"')

    // The `raw` field is typed as PublicKeyCredential but viem's Coinbase account
    // implementation only uses `webauthn` and `signature`. We cast to satisfy types.
    const raw = {
      id: credentialId,
      type: 'public-key',
      authenticatorAttachment: null,
      rawId: new Uint8Array(),
      response: {
        authenticatorData: hexToUint8Array(authenticatorData),
        clientDataJSON: new TextEncoder().encode(clientDataJSON),
        signature: hexToUint8Array(normalizedSignature),
      },
      clientExtensionResults: {},
      getClientExtensionResults: () => ({}),
      toJSON: () => ({}),
    } as unknown as WebAuthnSignReturnType['raw']

    return {
      signature: normalizedSignature,
      webauthn: {
        authenticatorData,
        clientDataJSON,
        typeIndex,
        challengeIndex,
        userVerificationRequired: true,
      },
      raw,
    }
  }

  return {
    id: credentialId,
    publicKey: normalizedPublicKey,
    type: 'webAuthn',

    async sign({ hash }) {
      return signWithWebAuthn(hash)
    },

    async signMessage({ message }: { message: SignableMessage }) {
      const hash = hashMessage(message)
      return signWithWebAuthn(hash)
    },

    // Use a concrete type to avoid generic variance issues
    signTypedData: (async (typedData: TypedDataDefinition) => {
      const hash = hashTypedData(typedData)
      return signWithWebAuthn(hash)
    }) as WebAuthnAccount['signTypedData'],
  }
}

export function normalizeWebAuthnPublicKey(publicKeyHex: Hex): Hex {
  if (publicKeyHex.startsWith('0x04') && publicKeyHex.length === 132) {
    return `0x${publicKeyHex.slice(4)}` as Hex
  }

  if (publicKeyHex.length === 130) {
    return publicKeyHex
  }

  throw new Error(`Invalid WebAuthn public key length: ${publicKeyHex.length}`)
}

const P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')
const P256_N_DIV_2 = P256_N / 2n

export function normalizeP256Signature(signature: Hex): Hex {
  if (signature.length !== 130) {
    throw new Error(`Invalid P-256 signature length: ${signature.length}`)
  }

  const r = signature.slice(2, 66)
  const sHex = signature.slice(66)
  const s = BigInt(`0x${sHex}`)
  const normalizedS = s > P256_N_DIV_2 ? P256_N - s : s

  return `0x${r}${normalizedS.toString(16).padStart(64, '0')}` as Hex
}

function hexToUint8Array(hex: Hex): Uint8Array {
  const bytes = hex.slice(2)
  const arr = new Uint8Array(bytes.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16)
  }
  return arr
}

function hexFromUtf8(value: string): Hex {
  return `0x${Buffer.from(value, 'utf8').toString('hex')}` as Hex
}
