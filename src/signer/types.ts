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

export type SignerMethod =
  | 'ping'
  | 'status'
  | 'get_public_key'
  | 'get_public_key_coordinates'
  | 'create_key'
  | 'sign_hash'
  | 'sign_user_op'
  | 'approve_action'

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

export interface GetPublicKeyCoordinatesResult {
  x: `0x${string}`
  y: `0x${string}`
}

export interface CreateKeyResult {
  publicKey: string
  x: `0x${string}`
  y: `0x${string}`
  created: boolean
}

// Client interface
export interface SignerClient {
  connect(): Promise<void>
  disconnect(): void
  ping(): Promise<PingResult>
  status(): Promise<StatusResult>
  getPublicKey(): Promise<GetPublicKeyResult>
  getPublicKeyCoordinates(): Promise<GetPublicKeyCoordinatesResult>
  createKey(): Promise<CreateKeyResult>
  signHash(params: SignHashParams): Promise<SignHashResult>
  approveAction(params: ApproveActionParams): Promise<ApproveActionResult>
}
