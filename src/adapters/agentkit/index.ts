export { accessProtectedEndpoint, encodeAgentkitHeader } from './client.js'
export type { AgentkitClientConfig } from './client.js'
export { parseAgentkitChallenge, buildSiweMessage, isAgentkitChallenge, AgentkitChallengeError } from './challenge.js'
export { validateTrustedAgentkitUrl } from './trust.js'
export { toCaip2 } from './types.js'
export type {
  AgentkitChallenge,
  AgentkitChallengeInfo,
  AgentkitPayload,
  AgentkitAccessResult,
  AgentkitMode,
  Caip2ChainId,
  SignatureType,
  SignatureScheme,
  SupportedChain,
} from './types.js'
