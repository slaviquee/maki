import type {
  SignerClient,
  PingResult,
  StatusResult,
  GetPublicKeyResult,
  GetPublicKeyCoordinatesResult,
  CreateKeyResult,
  SignHashParams,
  SignHashResult,
  ApproveActionParams,
  ApproveActionResult,
} from './types.js'

// Deterministic test key — never used on-chain
const MOCK_PUBLIC_KEY = '0x04' + 'ab'.repeat(32) + 'cd'.repeat(32)
const MOCK_ADDRESS = ('0x' + 'ee'.repeat(20)) as `0x${string}`
const MOCK_SIGNATURE = ('0x' + 'ff'.repeat(64)) as `0x${string}`
const MOCK_X = ('0x' + 'ab'.repeat(32)) as `0x${string}`
const MOCK_Y = ('0x' + 'cd'.repeat(32)) as `0x${string}`

export function createMockSigner(): SignerClient {
  return {
    async connect() {},
    disconnect() {},

    async ping(): Promise<PingResult> {
      return { pong: true, version: '0.1.0-mock' }
    },

    async status(): Promise<StatusResult> {
      return { ready: true, signerType: 'mock', hasKey: true, publicKey: MOCK_PUBLIC_KEY }
    },

    async getPublicKey(): Promise<GetPublicKeyResult> {
      return { publicKey: MOCK_PUBLIC_KEY, address: MOCK_ADDRESS }
    },

    async getPublicKeyCoordinates(): Promise<GetPublicKeyCoordinatesResult> {
      return { x: MOCK_X, y: MOCK_Y }
    },

    async createKey(): Promise<CreateKeyResult> {
      return { publicKey: MOCK_PUBLIC_KEY, x: MOCK_X, y: MOCK_Y, created: true }
    },

    async signHash(_params: SignHashParams): Promise<SignHashResult> {
      return { signature: MOCK_SIGNATURE, approved: true }
    },

    async approveAction(_params: ApproveActionParams): Promise<ApproveActionResult> {
      return { approved: true }
    },
  }
}
