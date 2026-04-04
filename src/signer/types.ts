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
  // Ledger structured signing
  | 'get_address'
  | 'sign_personal_message'
  | 'sign_typed_data'
  | 'sign_transaction'

// Method params and results
export interface PingResult {
  pong: true
  version: string
}

export interface StatusResult {
  ready: boolean
  signerType: 'secure-enclave' | 'mock' | 'ledger'
  hasKey: boolean
  publicKey?: string
  keyStorage?: 'persistent' | 'ephemeral' | 'none'
  // Ledger-specific fields
  transport?: 'speculos'
  deviceConnected?: boolean
  ethereumAppOpen?: boolean
  address?: `0x${string}`
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
  keyStorage?: 'persistent' | 'ephemeral' | 'none'
}

// Ledger structured signing params/results
export interface GetAddressResult {
  address: `0x${string}`
  publicKey: string
}

export interface SignPersonalMessageParams {
  message: `0x${string}`
  actionSummary: string
  actionClass: ActionClass
}

export interface SignPersonalMessageResult {
  signature: `0x${string}`
  r: `0x${string}`
  s: `0x${string}`
  v: number
  approved: boolean
}

export interface SignTypedDataParams {
  typedData: {
    domain: Record<string, unknown>
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: string
    message: Record<string, unknown>
  }
  actionSummary: string
  actionClass: ActionClass
}

export interface SignTypedDataResult {
  signature: `0x${string}`
  r: `0x${string}`
  s: `0x${string}`
  v: number
  approved: boolean
}

export interface SignTransactionParams {
  serializedTransaction: `0x${string}`
  actionSummary: string
  actionClass: ActionClass
}

export interface SignTransactionResult {
  signature: `0x${string}`
  r: `0x${string}`
  s: `0x${string}`
  v: number
  approved: boolean
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
  // Ledger structured signing (optional — only available on Ledger backend)
  getAddress?(): Promise<GetAddressResult>
  signPersonalMessage?(params: SignPersonalMessageParams): Promise<SignPersonalMessageResult>
  signTypedData?(params: SignTypedDataParams): Promise<SignTypedDataResult>
  signTransaction?(params: SignTransactionParams): Promise<SignTransactionResult>
}
