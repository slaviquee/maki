import type { AgentkitChallenge, AgentkitChallengeInfo, SupportedChain, AgentkitMode } from './types.js'

/**
 * Parse an AgentKit challenge from a 402 response body.
 *
 * The 402 response contains x402 payment options with an `agentkit` extension.
 * This extracts and validates the challenge fields needed for signing.
 */
export function parseAgentkitChallenge(responseBody: unknown): AgentkitChallenge {
  if (typeof responseBody !== 'object' || responseBody === null) {
    throw new AgentkitChallengeError('Response body is not an object')
  }

  // The agentkit extension can be at top-level or nested under x402
  const body = responseBody as Record<string, unknown>
  const agentkit = extractAgentkitExtension(body)
  if (!agentkit) {
    throw new AgentkitChallengeError('No agentkit extension found in 402 response')
  }

  const ext = agentkit as Record<string, unknown>
  const info = parseInfo(ext['info'])
  const supportedChains = parseSupportedChains(ext['supportedChains'])
  const mode = ext['mode'] as AgentkitMode | undefined

  return { info, supportedChains, mode }
}

/**
 * Build a SIWE (EIP-4361) message string from challenge info.
 *
 * Format follows the CAIP-122 / EIP-4361 specification:
 * https://eips.ethereum.org/EIPS/eip-4361
 */
export function buildSiweMessage(info: AgentkitChallengeInfo, address: string, chainId: number): string {
  const lines: string[] = []

  // Header: domain wants you to sign in with your Ethereum account
  lines.push(`${info.domain} wants you to sign in with your Ethereum account:`)
  lines.push(address)

  // Statement (optional, separated by blank lines)
  if (info.statement) {
    lines.push('')
    lines.push(info.statement)
  }

  // Required fields
  lines.push('')
  lines.push(`URI: ${info.uri}`)
  lines.push(`Version: ${info.version}`)
  lines.push(`Chain ID: ${chainId}`)
  lines.push(`Nonce: ${info.nonce}`)
  lines.push(`Issued At: ${info.issuedAt}`)

  // Optional fields
  if (info.expirationTime) {
    lines.push(`Expiration Time: ${info.expirationTime}`)
  }
  if (info.notBefore) {
    lines.push(`Not Before: ${info.notBefore}`)
  }
  if (info.requestId) {
    lines.push(`Request ID: ${info.requestId}`)
  }
  if (info.resources && info.resources.length > 0) {
    lines.push('Resources:')
    for (const resource of info.resources) {
      lines.push(`- ${resource}`)
    }
  }

  return lines.join('\n')
}

/**
 * Check whether a response indicates a 402 AgentKit challenge.
 */
export function isAgentkitChallenge(status: number, body: unknown): boolean {
  if (status !== 402) return false
  if (typeof body !== 'object' || body === null) return false
  return extractAgentkitExtension(body as Record<string, unknown>) !== null
}

function extractAgentkitExtension(body: Record<string, unknown>): unknown {
  // Direct top-level
  if (body['agentkit']) return body['agentkit']

  // Nested under x402.accepts[].extensions.agentkit
  const x402 = body['x402'] as Record<string, unknown> | undefined
  if (x402) {
    // Check extensions at x402 level
    const extensions = x402['extensions'] as Record<string, unknown> | undefined
    if (extensions?.['agentkit']) return extensions['agentkit']

    // Check in accepts array
    const accepts = x402['accepts'] as Array<Record<string, unknown>> | undefined
    if (Array.isArray(accepts)) {
      for (const accept of accepts) {
        const ext = accept['extensions'] as Record<string, unknown> | undefined
        if (ext?.['agentkit']) return ext['agentkit']
      }
    }
  }

  // Nested under accepts[].extensions.agentkit (without x402 wrapper)
  const accepts = body['accepts'] as Array<Record<string, unknown>> | undefined
  if (Array.isArray(accepts)) {
    for (const accept of accepts) {
      const ext = accept['extensions'] as Record<string, unknown> | undefined
      if (ext?.['agentkit']) return ext['agentkit']
    }
  }

  return null
}

function parseInfo(raw: unknown): AgentkitChallengeInfo {
  if (typeof raw !== 'object' || raw === null) {
    throw new AgentkitChallengeError('Challenge info is not an object')
  }

  const obj = raw as Record<string, unknown>

  const domain = requireString(obj, 'domain')
  const uri = requireString(obj, 'uri')
  const version = requireString(obj, 'version')
  const nonce = requireString(obj, 'nonce')
  const issuedAt = requireString(obj, 'issuedAt')

  return {
    domain,
    uri,
    version,
    nonce,
    issuedAt,
    statement: optionalString(obj, 'statement'),
    expirationTime: optionalString(obj, 'expirationTime'),
    notBefore: optionalString(obj, 'notBefore'),
    requestId: optionalString(obj, 'requestId'),
    resources: obj['resources'] as string[] | undefined,
  }
}

function parseSupportedChains(raw: unknown): SupportedChain[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AgentkitChallengeError('supportedChains must be a non-empty array')
  }

  return raw.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new AgentkitChallengeError(`supportedChains[${i}] is not an object`)
    }
    const obj = entry as Record<string, unknown>
    return {
      chainId: requireString(obj, 'chainId') as SupportedChain['chainId'],
      type: requireString(obj, 'type') as SupportedChain['type'],
    }
  })
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key]
  if (typeof val !== 'string') {
    throw new AgentkitChallengeError(`Missing or invalid field: ${key}`)
  }
  return val
}

function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key]
  return typeof val === 'string' ? val : undefined
}

export class AgentkitChallengeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentkitChallengeError'
  }
}
