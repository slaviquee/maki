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
  GetPublicKeyCoordinatesResult,
  CreateKeyResult,
  SignHashParams,
  SignHashResult,
  ApproveActionParams,
  ApproveActionResult,
  GetAddressResult,
  SignPersonalMessageParams,
  SignPersonalMessageResult,
  SignTypedDataParams,
  SignTypedDataResult,
  SignTransactionParams,
  SignTransactionResult,
} from './types.js'
