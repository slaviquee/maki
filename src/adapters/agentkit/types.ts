import type { SupportedChainId } from '../../config/types.js'

/** CAIP-2 formatted chain identifier */
export type Caip2ChainId = `eip155:${number}`

/** EVM signature verification modes */
export type SignatureType = 'eip191' | 'eip1271'

/** Signature scheme used by the signer */
export type SignatureScheme = 'eip191' | 'eip1271' | 'eip6492'

/** AgentKit access mode sent by the server */
export type AgentkitMode =
  | { type: 'free' }
  | { type: 'free-trial'; uses?: number }
  | { type: 'discount'; percent: number; uses?: number }

/** Supported chain info from the server challenge */
export interface SupportedChain {
  chainId: Caip2ChainId
  type: SignatureType
}

/** Server challenge info embedded in the 402 response */
export interface AgentkitChallengeInfo {
  domain: string
  uri: string
  version: string
  nonce: string
  issuedAt: string
  statement?: string
  expirationTime?: string
  notBefore?: string
  requestId?: string
  resources?: string[]
}

/** Full AgentKit extension from a 402 response body */
export interface AgentkitChallenge {
  info: AgentkitChallengeInfo
  supportedChains: SupportedChain[]
  mode?: AgentkitMode
}

/** Payload sent in the `agentkit` header after signing */
export interface AgentkitPayload {
  domain: string
  address: string
  uri: string
  version: string
  chainId: Caip2ChainId
  type: SignatureType
  nonce: string
  issuedAt: string
  signature: string
  signatureScheme?: SignatureScheme
  statement?: string
  expirationTime?: string
  notBefore?: string
  requestId?: string
  resources?: string[]
}

/** Result of attempting access to an AgentKit-protected endpoint */
export interface AgentkitAccessResult {
  success: boolean
  status: number
  verified: boolean
  usesRemaining?: number
  body: unknown
  error?: string
}

export function toCaip2(chainId: SupportedChainId): Caip2ChainId {
  return `eip155:${chainId}`
}
