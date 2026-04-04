/**
 * Direct EOA transaction submission for Ledger EOA demo mode.
 *
 * This module creates a viem LocalAccount backed by the Ledger signer
 * and submits normal Ethereum transactions (not ERC-4337 UserOperations).
 *
 * Used exclusively when ledger.accountMode === 'eoa-demo'.
 * The existing smart-account / bundler path is untouched.
 */

import {
  createWalletClient,
  http,
  serializeTransaction,
  type Hex,
  type PublicClient,
  type TransactionSerializableEIP1559,
} from 'viem'
import { toAccount, type LocalAccount } from 'viem/accounts'
import type { SignerClient } from '../signer/types.js'
import type { ActionClass } from '../policy/types.js'
import type { SupportedChainId } from '../config/types.js'
import { CHAINS } from './chains.js'

export interface EoaSubmissionResult {
  status: 'confirmed' | 'failed'
  txHash?: Hex
  error?: string
}

/**
 * Creates a viem LocalAccount that delegates signTransaction to the
 * Ledger device via IPC. Only signTransaction is implemented — this
 * account is not used for smart-account UserOp signing.
 */
function createLedgerEoaAccount(
  signer: SignerClient,
  address: `0x${string}`,
  actionSummary: string,
  actionClass: ActionClass,
): LocalAccount {
  return toAccount({
    address,

    async signMessage(): Promise<Hex> {
      throw new Error('signMessage not used in Ledger EOA demo mode')
    },

    async signTransaction(transaction): Promise<Hex> {
      if (!signer.signTransaction) {
        throw new Error('Ledger signer does not support signTransaction — is the Ledger backend running?')
      }

      const serialized = serializeTransaction(transaction as TransactionSerializableEIP1559)

      const result = await signer.signTransaction({
        serializedTransaction: serialized as `0x${string}`,
        actionSummary,
        actionClass,
      })

      if (!result.approved) {
        throw new Error('Signing rejected on Ledger device')
      }

      // Reconstruct signed serialized transaction
      const yParity = result.v >= 27 ? result.v - 27 : result.v
      return serializeTransaction(transaction as TransactionSerializableEIP1559, {
        r: result.r,
        s: result.s,
        yParity: yParity as 0 | 1,
      })
    },

    async signTypedData(): Promise<Hex> {
      throw new Error('signTypedData not used in Ledger EOA demo mode')
    },
  }) as LocalAccount
}

/**
 * Submits a normal Ethereum transaction signed by the Ledger device.
 *
 * Flow: build tx → sign on Ledger → broadcast via eth_sendRawTransaction → wait for receipt.
 *
 * This is the Ledger EOA demo equivalent of submitUserOperation.
 */
export async function submitEoaTransaction(
  client: PublicClient,
  signer: SignerClient,
  address: `0x${string}`,
  call: { to: `0x${string}`; value?: bigint; data?: Hex },
  chainId: SupportedChainId,
  rpcUrl: string,
  actionSummary: string,
  actionClass: ActionClass,
): Promise<EoaSubmissionResult> {
  const chain = CHAINS[chainId]
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`)

  const account = createLedgerEoaAccount(signer, address, actionSummary, actionClass)

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  })

  let hash: Hex
  try {
    hash = await walletClient.sendTransaction({
      to: call.to,
      value: call.value ?? 0n,
      data: call.data,
      chain,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes('Signing rejected on Ledger device') ||
      message.includes('rejected') ||
      message.includes('cancelled')
    ) {
      return { status: 'failed', error: 'User rejected the action on Ledger device' }
    }
    return { status: 'failed', error: `Transaction send failed: ${message}` }
  }

  try {
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 })
    if (receipt.status === 'success') {
      return { status: 'confirmed', txHash: hash }
    }
    return { status: 'failed', txHash: hash, error: 'Transaction reverted on-chain' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { status: 'failed', txHash: hash, error: `Receipt wait failed: ${message}` }
  }
}
