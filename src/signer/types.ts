import type { ActionClass } from '../policy/types.js'

// IPC envelope
export interface IpcRequest {
  id: string
  method: SignerMethod
  params: unknown
}

export interface IpcResponse {
  id: string
  ok: boolean
  result?: unknown
  error?: { code: string; message: string }
}

export type SignerMethod = 'ping' | 'status' | 'get_public_key' | 'sign_hash' | 'sign_user_op' | 'approve_action'

// Method params and results
export interface PingResult {
  pong: true
  version: string
}

export interface StatusResult {
  ready: boolean
  signerType: 'secure-enclave' | 'mock'
  hasKey: boolean
  publicKey?: string
}

export interface GetPublicKeyResult {
  publicKey: string
  address: `0x${string}`
}

export interface SignHashParams {
  hash: `0x${string}`
  actionSummary: string
  actionClass: ActionClass
}

export interface SignHashResult {
  signature: `0x${string}`
  approved: boolean
}

export interface ApproveActionParams {
  summary: string
  actionClass: ActionClass
  details: Record<string, unknown>
}

export interface ApproveActionResult {
  approved: boolean
  reason?: string
}

// Client interface
export interface SignerClient {
  connect(): Promise<void>
  disconnect(): void
  ping(): Promise<PingResult>
  status(): Promise<StatusResult>
  getPublicKey(): Promise<GetPublicKeyResult>
  signHash(params: SignHashParams): Promise<SignHashResult>
  approveAction(params: ApproveActionParams): Promise<ApproveActionResult>
}
