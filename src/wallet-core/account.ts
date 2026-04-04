import { type PublicClient, type Hex, getAddress } from 'viem'
import { toCoinbaseSmartAccount, getUserOperationHash, type UserOperation } from 'viem/account-abstraction'
import type { SignerClient } from '../signer/types.js'
import type { ActionClass } from '../policy/types.js'
import { createWebAuthnAccount } from './webauthn-adapter.js'
import { createLedgerOwner } from './ledger-owner.js'

export type OwnerType = 'webauthn' | 'ledger'

export interface SmartAccountInfo {
  address: `0x${string}`
  isDeployed: boolean
  ownerPublicKey: Hex
  ownerType: OwnerType
  /** P-256 X coordinate (WebAuthn only) */
  ownerX?: Hex
  /** P-256 Y coordinate (WebAuthn only) */
  ownerY?: Hex
  /** Ethereum address of secp256k1 owner (Ledger only) */
  ownerAddress?: `0x${string}`
}

export interface SmartAccountSigningRequest {
  actionSummary: string
  actionClass: ActionClass
}

/**
 * Detects whether the connected signer is a Ledger (secp256k1) or
 * Secure Enclave / mock (P-256 WebAuthn) backend.
 */
async function detectOwnerType(signer: SignerClient): Promise<OwnerType> {
  try {
    const status = await signer.status()
    if (status.signerType === 'ledger') return 'ledger'
  } catch {
    // If status fails, fall through to default
  }
  return 'webauthn'
}

/**
 * Creates a Coinbase Smart Wallet instance backed by the maki signer daemon.
 *
 * Dispatches based on signer backend:
 * - Secure Enclave / mock → P-256 WebAuthn owner
 * - Ledger → secp256k1 LocalAccount owner
 *
 * Both paths use the same Coinbase Smart Account, but different signature
 * verification schemes on-chain.
 */
export async function createSmartAccount(
  client: PublicClient,
  signer: SignerClient,
  opts?: { nonce?: bigint; signingRequest?: SmartAccountSigningRequest },
) {
  const ownerType = await detectOwnerType(signer)

  if (ownerType === 'ledger') {
    return createLedgerSmartAccount(client, signer, opts)
  }

  return createWebAuthnSmartAccount(client, signer, opts)
}

/**
 * Creates a smart account with a WebAuthn/P-256 owner (Secure Enclave path).
 */
async function createWebAuthnSmartAccount(
  client: PublicClient,
  signer: SignerClient,
  opts?: { nonce?: bigint; signingRequest?: SmartAccountSigningRequest },
) {
  const keyResult = await signer.getPublicKey()
  const publicKeyHex = keyResult.publicKey as Hex
  const webAuthnAccount = createWebAuthnAccount(signer, publicKeyHex, 'maki-enclave-key', opts?.signingRequest)

  return toCoinbaseSmartAccount({
    client,
    owners: [webAuthnAccount],
    version: '1.1',
    nonce: opts?.nonce,
  })
}

/**
 * Creates a smart account with a Ledger secp256k1 owner.
 *
 * The Ledger device holds the secp256k1 key. Signing goes through
 * the IPC protocol → Ledger device for on-device confirmation.
 */
async function createLedgerSmartAccount(
  client: PublicClient,
  signer: SignerClient,
  opts?: { nonce?: bigint; signingRequest?: SmartAccountSigningRequest },
) {
  // Get the Ledger's Ethereum address
  let address: `0x${string}`
  if (signer.getAddress) {
    const addrResult = await signer.getAddress()
    address = addrResult.address
  } else {
    const keyResult = await signer.getPublicKey()
    address = keyResult.address
  }

  const signingContext = opts?.signingRequest
    ? { actionSummary: opts.signingRequest.actionSummary, actionClass: opts.signingRequest.actionClass }
    : undefined

  const ledgerOwner = createLedgerOwner(signer, address, signingContext)

  const account = await toCoinbaseSmartAccount({
    client,
    owners: [ledgerOwner],
    version: '1.1',
    nonce: opts?.nonce,
  })

  return {
    ...account,
    async signUserOperation(parameters: Parameters<typeof account.signUserOperation>[0]) {
      const { chainId = client.chain!.id, ...userOperation } = parameters
      const sender = await account.getAddress()
      const hash = getUserOperationHash({
        chainId,
        entryPointAddress: account.entryPoint.address,
        entryPointVersion: account.entryPoint.version,
        userOperation: {
          ...(userOperation as unknown as UserOperation),
          sender,
        },
      })

      if (!account.sign) {
        throw new Error('Ledger smart account does not expose sign({ hash })')
      }

      return account.sign({ hash })
    },
  }
}

/**
 * Gets info about the smart account without creating a full account instance.
 */
export async function getSmartAccountInfo(client: PublicClient, signer: SignerClient): Promise<SmartAccountInfo> {
  const ownerType = await detectOwnerType(signer)
  const account = await createSmartAccount(client, signer)
  const isDeployed = await account.isDeployed()
  const keyResult = await signer.getPublicKey()

  if (ownerType === 'ledger') {
    return {
      address: getAddress(account.address),
      isDeployed,
      ownerPublicKey: keyResult.publicKey as Hex,
      ownerType: 'ledger',
      ownerAddress: keyResult.address,
    }
  }

  const coords = await signer.getPublicKeyCoordinates()
  return {
    address: getAddress(account.address),
    isDeployed,
    ownerPublicKey: keyResult.publicKey as Hex,
    ownerType: 'webauthn',
    ownerX: coords.x,
    ownerY: coords.y,
  }
}
