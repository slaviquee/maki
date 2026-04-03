import type {
  SignerClient,
  PingResult,
  StatusResult,
  GetPublicKeyResult,
  SignHashParams,
  SignHashResult,
  ApproveActionParams,
  ApproveActionResult,
} from './types.js'

// Deterministic test key — never used on-chain
const MOCK_PUBLIC_KEY = '0x04' + 'ab'.repeat(32) + 'cd'.repeat(32)
const MOCK_ADDRESS = '0x' + 'ee'.repeat(20) as `0x${string}`
const MOCK_SIGNATURE = '0x' + 'ff'.repeat(64) as `0x${string}`

export function createMockSigner(): SignerClient {
  return {
    async connect() {
      // no-op for mock
    },

    disconnect() {
      // no-op for mock
    },

    async ping(): Promise<PingResult> {
      return { pong: true, version: '0.1.0-mock' }
    },

    async status(): Promise<StatusResult> {
      return {
        ready: true,
        signerType: 'mock',
        hasKey: true,
        publicKey: MOCK_PUBLIC_KEY,
      }
    },

    async getPublicKey(): Promise<GetPublicKeyResult> {
      return {
        publicKey: MOCK_PUBLIC_KEY,
        address: MOCK_ADDRESS,
      }
    },

    async signHash(_params: SignHashParams): Promise<SignHashResult> {
      return {
        signature: MOCK_SIGNATURE,
        approved: true,
      }
    },

    async approveAction(_params: ApproveActionParams): Promise<ApproveActionResult> {
      return { approved: true }
    },
  }
}
