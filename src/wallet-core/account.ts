import { type PublicClient, type Hex, getAddress } from 'viem'
import { toCoinbaseSmartAccount } from 'viem/account-abstraction'
import type { SignerClient } from '../signer/types.js'
import { createWebAuthnAccount } from './webauthn-adapter.js'

export interface SmartAccountInfo {
  address: `0x${string}`
  isDeployed: boolean
  ownerPublicKey: Hex
  ownerX: Hex
  ownerY: Hex
}

/**
 * Creates a Coinbase Smart Wallet instance backed by the maki signer daemon.
 *
 * The wallet uses P-256 (secp256r1) signatures from Apple Secure Enclave,
 * wrapped in WebAuthn format for on-chain verification.
 */
export async function createSmartAccount(client: PublicClient, signer: SignerClient, opts?: { nonce?: bigint }) {
  // Get P-256 public key from signer
  const keyResult = await signer.getPublicKey()
  const publicKeyHex = keyResult.publicKey as Hex

  // Create WebAuthn account adapter
  const webAuthnAccount = createWebAuthnAccount(signer, publicKeyHex, 'maki-enclave-key')

  // Create Coinbase Smart Account
  const account = await toCoinbaseSmartAccount({
    client,
    owners: [webAuthnAccount],
    version: '1.1',
    nonce: opts?.nonce,
  })

  return account
}

/**
 * Gets info about the smart account without creating a full account instance.
 */
export async function getSmartAccountInfo(client: PublicClient, signer: SignerClient): Promise<SmartAccountInfo> {
  const account = await createSmartAccount(client, signer)
  const isDeployed = await account.isDeployed()
  const coords = await signer.getPublicKeyCoordinates()
  const keyResult = await signer.getPublicKey()

  return {
    address: getAddress(account.address),
    isDeployed,
    ownerPublicKey: keyResult.publicKey as Hex,
    ownerX: coords.x,
    ownerY: coords.y,
  }
}
