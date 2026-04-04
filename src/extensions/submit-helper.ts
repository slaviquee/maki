import { createSmartAccount } from '../wallet-core/account.js'
import { submitUserOperation } from '../wallet-core/submit.js'
import { submitEoaTransaction } from '../wallet-core/eoa-submit.js'
import type { WriteResult } from '../wallet-core/execute.js'
import type { UserOpCall } from '../wallet-core/userop.js'
import type { MakiContext } from './context.js'

/**
 * Submits an approved write action.
 *
 * Routes based on account mode:
 * - smart-account → bundler / UserOperation (existing path)
 * - eoa-demo → direct Ethereum transaction via Ledger
 *
 * Fail-closed: refuses to submit if signer is mock/mock-fallback.
 */
export async function submitApproved(
  maki: MakiContext,
  calls: UserOpCall[],
  result: WriteResult,
): Promise<WriteResult> {
  // Fail closed: no live submission with mock signer
  if (maki.signerMode === 'mock' || maki.signerMode === 'mock-fallback') {
    return {
      ...result,
      error: `Live submission blocked: signer is in ${maki.signerMode} mode. Start the signer daemon for real transactions.`,
    }
  }

  // Route: Ledger EOA demo → direct transaction
  if (maki.accountMode === 'eoa-demo') {
    return submitEoaDirect(maki, calls, result)
  }

  // Route: smart-account → bundler / UserOperation
  return submitSmartAccount(maki, calls, result)
}

async function resolveLiveLedgerEoaAddress(maki: MakiContext): Promise<`0x${string}`> {
  if (maki.signer.getAddress) {
    const derived = await maki.signer.getAddress()
    return derived.address
  }

  const keyResult = await maki.signer.getPublicKey()
  return keyResult.address
}

/**
 * Ledger EOA demo: submit a direct Ethereum transaction.
 * Only the first call is submitted (EOA transactions are single-call).
 */
async function submitEoaDirect(maki: MakiContext, calls: UserOpCall[], result: WriteResult): Promise<WriteResult> {
  const configuredAddress = maki.config.ledgerAddress
  if (!configuredAddress) {
    return {
      ...result,
      status: 'error',
      error: 'Ledger EOA address not set. Run setup_ledger_account first.',
    }
  }

  let liveAddress: `0x${string}`
  try {
    liveAddress = await resolveLiveLedgerEoaAddress(maki)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ...result,
      status: 'error',
      error: `Could not verify the connected Ledger address: ${message}`,
    }
  }

  if (liveAddress.toLowerCase() !== configuredAddress.toLowerCase()) {
    return {
      ...result,
      status: 'error',
      error:
        `Configured Ledger EOA address does not match the connected device. ` +
        `Config: ${configuredAddress}. Device: ${liveAddress}. ` +
        `Run setup_ledger_account again before submitting.`,
    }
  }

  if (calls.length === 0) {
    return { ...result, status: 'error', error: 'No calls to submit' }
  }

  // EOA transactions are single-call. If there are multiple calls, only the first is supported.
  if (calls.length > 1) {
    return {
      ...result,
      status: 'error',
      error: `Ledger EOA demo mode supports single-call transactions only (got ${calls.length} calls). Use smart-account mode for batched operations.`,
    }
  }

  const call = calls[0]!
  let submission
  try {
    submission = await submitEoaTransaction(
      maki.chainClient,
      maki.signer,
      liveAddress,
      { to: call.to, value: call.value, data: call.data },
      maki.config.chainId,
      maki.config.rpcUrl,
      result.summary,
      result.actionClass,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (
      message.includes('Signing rejected') ||
      message.includes('User cancelled') ||
      message.includes('rejected on Ledger device')
    ) {
      maki.auditLog.log('user_rejected', result.summary)
      return { ...result, status: 'rejected', error: 'User rejected the action on Ledger device' }
    }

    maki.auditLog.log('write_failed', message)
    return { ...result, status: 'error', error: `Submission failed: ${message}` }
  }

  if (submission.status === 'confirmed') {
    maki.auditLog.log('write_submitted', result.summary, { txHash: submission.txHash })
    if (result.spendType && result.amountUsdc !== undefined) {
      maki.spending.record(result.spendType, result.amountUsdc)
    }
    maki.auditLog.log('write_confirmed', `tx: ${submission.txHash}`, { txHash: submission.txHash })
    return { ...result, status: 'confirmed', txHash: submission.txHash }
  }

  maki.auditLog.log('write_failed', submission.error ?? 'Unknown', { txHash: submission.txHash })
  return { ...result, status: 'error', error: `Submission failed: ${submission.error}`, txHash: submission.txHash }
}

/**
 * Smart-account path: submit via bundler / UserOperation (existing behavior).
 */
async function submitSmartAccount(maki: MakiContext, calls: UserOpCall[], result: WriteResult): Promise<WriteResult> {
  if (!maki.config.bundlerApiKey) {
    return {
      ...result,
      error:
        'Live submission blocked: no bundlerApiKey in ~/.maki/config.yaml. Add a Pimlico API key to submit transactions.',
    }
  }

  const account = await createSmartAccount(maki.chainClient, maki.signer, {
    signingRequest: {
      actionSummary: result.summary,
      actionClass: result.actionClass,
    },
  })

  let submission
  try {
    submission = await submitUserOperation(account, calls, {
      chainId: maki.config.chainId,
      bundlerApiKey: maki.config.bundlerApiKey,
      rpcUrl: maki.config.rpcUrl,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (
      message.includes('Signing rejected by user') ||
      message.includes('User cancelled') ||
      message.includes('Signing rejected on Ledger device')
    ) {
      maki.auditLog.log('user_rejected', result.summary)
      return {
        ...result,
        status: 'rejected',
        error: 'User rejected the action',
      }
    }

    maki.auditLog.log('write_failed', message)
    return {
      ...result,
      status: 'error',
      error: `Submission failed: ${message}`,
    }
  }

  if (submission.status === 'confirmed') {
    maki.auditLog.log('write_submitted', result.summary, {
      userOpHash: submission.userOpHash,
    })
    if (result.spendType && result.amountUsdc !== undefined) {
      maki.spending.record(result.spendType, result.amountUsdc)
    }
    maki.auditLog.log('write_confirmed', `tx: ${submission.txHash}`, {
      userOpHash: submission.userOpHash,
      txHash: submission.txHash,
    })
    return {
      ...result,
      status: 'confirmed',
      userOpHash: submission.userOpHash,
      txHash: submission.txHash,
    }
  }

  maki.auditLog.log('write_submitted', result.summary, {
    userOpHash: submission.userOpHash,
  })
  maki.auditLog.log('write_failed', submission.error ?? 'Unknown', {
    userOpHash: submission.userOpHash,
    txHash: submission.txHash,
  })
  return {
    ...result,
    status: 'error',
    error: `Submission failed: ${submission.error}`,
    userOpHash: submission.userOpHash,
    txHash: submission.txHash,
  }
}
