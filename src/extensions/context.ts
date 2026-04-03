import type { PublicClient } from 'viem'
import type { MakiConfig } from '../config/types.js'
import type { SignerClient } from '../signer/types.js'
import type { PolicyStore } from '../policy/store.js'
import type { SpendingTracker } from '../policy/spending-tracker.js'
import type { AuditLog } from '../wallet-core/audit-log.js'

export type SignerMode = 'secure-enclave' | 'ipc' | 'mock' | 'mock-fallback'

export interface MakiContext {
  config: MakiConfig
  signer: SignerClient
  signerMode: SignerMode
  policy: PolicyStore
  chainClient: PublicClient
  spending: SpendingTracker
  auditLog: AuditLog
}
