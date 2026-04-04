/**
 * Creates a viem LocalAccount backed by Ledger signing via IPC.
 *
 * This adapter bridges the Maki signer IPC protocol to viem's account
 * interface so that Ledger can serve as a secp256k1 owner for the
 * Coinbase Smart Account.
 *
 * Signing flows:
 * - signMessage → IPC sign_personal_message → Ledger device personal_sign
 * - signTypedData → IPC sign_typed_data → Ledger device EIP-712 sign
 *
 * Raw UserOp hash signing is intentionally not implemented here. The
 * Coinbase Smart Wallet wrapper must route that path through replay-safe
 * typed data instead of a raw/personal-sign fallback.
 *
 * The Ledger device shows the payload to the user for on-device confirmation.
 * This preserves the structured-signing/no-blind-signing invariant.
 */

import { toHex, type Hex, type SignableMessage, type TypedDataDefinition } from 'viem'
import { toAccount, type LocalAccount } from 'viem/accounts'
import type { SignerClient } from '../signer/types.js'
import type { ActionClass } from '../policy/types.js'

interface LedgerOwnerSigningContext {
  actionSummary: string
  actionClass: ActionClass
}

/**
 * Creates a viem LocalAccount whose signing operations delegate to the
 * Ledger signer through the Maki IPC protocol.
 *
 * The `signingContext` provides the action summary and risk class that get
 * displayed in the terminal and logged to the audit trail. For UserOp signing,
 * this is set by the caller (submit-helper) before the signing call.
 */
export function createLedgerOwner(
  signer: SignerClient,
  address: `0x${string}`,
  signingContext?: LedgerOwnerSigningContext,
): LocalAccount {
  const ctx = signingContext ?? { actionSummary: 'Approve on-chain action', actionClass: 1 as ActionClass }

  function messageToHex(message: SignableMessage): Hex {
    if (typeof message === 'string') {
      return toHex(message)
    }
    if (message.raw instanceof Uint8Array) {
      return toHex(message.raw)
    }
    return message.raw
  }

  return toAccount({
    address,

    async signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
      if (!signer.signPersonalMessage) {
        throw new Error('Ledger signer does not support signPersonalMessage — is the Ledger backend running?')
      }

      const msgHex = messageToHex(message) as `0x${string}`
      const result = await signer.signPersonalMessage({
        message: msgHex,
        actionSummary: ctx.actionSummary,
        actionClass: ctx.actionClass,
      })

      if (!result.approved) {
        throw new Error('Signing rejected on Ledger device')
      }

      return result.signature
    },

    async signTransaction(): Promise<Hex> {
      // For ERC-4337 smart accounts, the owner never signs raw transactions.
      // All signing goes through signMessage (UserOp hash) or signTypedData.
      throw new Error(
        'Direct transaction signing is not supported for smart account owners. ' +
          'UserOperations are signed via signMessage.',
      )
    },

    // Use a concrete type to avoid generic variance issues with TypedDataDefinition
    signTypedData: (async (typedData: TypedDataDefinition) => {
      if (!signer.signTypedData) {
        throw new Error('Ledger signer does not support signTypedData — is the Ledger backend running?')
      }

      const result = await signer.signTypedData({
        typedData: {
          domain: (typedData.domain ?? {}) as Record<string, unknown>,
          types: (typedData.types ?? {}) as unknown as Record<string, Array<{ name: string; type: string }>>,
          primaryType: (typedData.primaryType ?? '') as string,
          message: (typedData.message ?? {}) as Record<string, unknown>,
        },
        actionSummary: ctx.actionSummary,
        actionClass: ctx.actionClass,
      })

      if (!result.approved) {
        throw new Error('Signing rejected on Ledger device')
      }

      return result.signature
    }) as LocalAccount['signTypedData'],
  }) as LocalAccount
}
