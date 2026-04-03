export { createSignerIpcClient } from './ipc-client.js'
export { createMockSigner } from './mock-signer.js'
export type {
  SignerClient,
  SignerMethod,
  IpcRequest,
  IpcResponse,
  PingResult,
  StatusResult,
  GetPublicKeyResult,
  SignHashParams,
  SignHashResult,
  ApproveActionParams,
  ApproveActionResult,
} from './types.js'
