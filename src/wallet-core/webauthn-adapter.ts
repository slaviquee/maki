import { type Hex, hashMessage, hashTypedData, type SignableMessage, type TypedDataDefinition } from 'viem'
import type { WebAuthnAccount, WebAuthnSignReturnType } from 'viem/account-abstraction'
import type { SignerClient } from '../signer/types.js'

/**
 * Bridges the maki signer daemon (Secure Enclave P-256) to viem's WebAuthnAccount interface.
 *
 * The Coinbase Smart Wallet expects WebAuthn-formatted P-256 signatures.
 * This adapter constructs minimal but valid WebAuthn structures around
 * the raw Secure Enclave signature.
 */
export function createWebAuthnAccount(
  signer: SignerClient,
  publicKeyHex: Hex,
  credentialId: string,
): WebAuthnAccount {
  async function signWithWebAuthn(hash: Hex): Promise<WebAuthnSignReturnType> {
    const result = await signer.signHash({
      hash,
      actionSummary: 'Sign message',
      actionClass: 1,
    })

    if (!result.approved) {
      throw new Error('Signing rejected by user')
    }

    // Construct minimal WebAuthn authenticatorData
    // rpIdHash (32 bytes zeros) + flags (0x05 = UP+UV) + counter (4 bytes zeros)
    const authenticatorData = ('0x' + '00'.repeat(32) + '05' + '00000000') as Hex

    // Construct clientDataJSON with the challenge
    const challenge = Buffer.from(hash.slice(2), 'hex').toString('base64url')
    const clientDataJSON = JSON.stringify({
      type: 'webauthn.get',
      challenge,
      origin: 'https://maki.local',
      crossOrigin: false,
    })

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
        signature: hexToUint8Array(result.signature),
      },
      clientExtensionResults: {},
      getClientExtensionResults: () => ({}),
      toJSON: () => ({}),
    } as unknown as WebAuthnSignReturnType['raw']

    return {
      signature: result.signature,
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
    publicKey: publicKeyHex,
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

function hexToUint8Array(hex: Hex): Uint8Array {
  const bytes = hex.slice(2)
  const arr = new Uint8Array(bytes.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16)
  }
  return arr
}
