import type { PublicClient } from 'viem'
import type { MakiConfig } from '../config/types.js'
import type { SignerClient } from '../signer/types.js'
import type { PolicyStore } from '../policy/store.js'
import type { SpendingTracker } from '../policy/spending-tracker.js'
import type { AuditLog } from '../wallet-core/audit-log.js'

export type SignerMode = 'secure-enclave' | 'ledger' | 'ipc' | 'mock' | 'mock-fallback'

export type AccountMode = 'smart-account' | 'eoa-demo'

export interface MakiContext {
  config: MakiConfig
  signer: SignerClient
  signerMode: SignerMode
  /** Whether this session uses a smart account or direct Ledger EOA */
  accountMode: AccountMode
  policy: PolicyStore
  chainClient: PublicClient
  spending: SpendingTracker
  auditLog: AuditLog
}

/**
 * Returns the active address for the current account mode.
 * - smart-account → smartAccountAddress
 * - eoa-demo → ledgerAddress
 */
export function getActiveAddress(ctx: MakiContext): `0x${string}` | undefined {
  if (ctx.accountMode === 'eoa-demo') {
    return ctx.config.ledgerAddress
  }
  return ctx.config.smartAccountAddress
}
