import { createSmartAccount } from '../wallet-core/account.js'
import { submitUserOperation } from '../wallet-core/submit.js'
import type { WriteResult } from '../wallet-core/execute.js'
import type { UserOpCall } from '../wallet-core/userop.js'
import type { MakiContext } from './context.js'

/**
 * Submits an approved write action via the bundler.
 *
 * Fail-closed: refuses to submit if signer is mock/mock-fallback or bundler key is missing.
 * Returns the WriteResult updated with submission status and hashes.
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

  if (!maki.config.bundlerApiKey) {
    return {
      ...result,
      error:
        'Live submission blocked: no bundlerApiKey in ~/.maki/config.yaml. Add a Pimlico API key to submit transactions.',
    }
  }

  const account = await createSmartAccount(maki.chainClient, maki.signer)

  maki.auditLog.log('write_submitted', result.summary)

  const submission = await submitUserOperation(account, calls, {
    chainId: maki.config.chainId,
    bundlerApiKey: maki.config.bundlerApiKey,
    rpcUrl: maki.config.rpcUrl,
  })

  if (submission.status === 'confirmed') {
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
