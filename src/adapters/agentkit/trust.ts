const DEFAULT_ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export interface TrustedAgentkitUrlResult {
  ok: boolean
  error?: string
  origin?: string
}

export function validateTrustedAgentkitUrl(
  url: string,
  allowedOriginsEnv: string | undefined = process.env['MAKI_AGENTKIT_ALLOWED_ORIGINS'],
): TrustedAgentkitUrlResult {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return {
      ok: false,
      error: `Invalid AgentKit URL: ${url}`,
    }
  }

  if (isLoopbackOrigin(parsed)) {
    return {
      ok: true,
      origin: parsed.origin,
    }
  }

  const allowedOrigins = parseAllowedOrigins(allowedOriginsEnv)
  if (allowedOrigins.has(parsed.origin)) {
    return {
      ok: true,
      origin: parsed.origin,
    }
  }

  return {
    ok: false,
    error:
      `Refusing AgentKit verification for untrusted origin ${parsed.origin}. ` +
      `Allowed by default: loopback origins only. ` +
      `Set MAKI_AGENTKIT_ALLOWED_ORIGINS to explicitly allow additional origins.`,
  }
}

function isLoopbackOrigin(url: URL): boolean {
  return (url.protocol === 'http:' || url.protocol === 'https:') && DEFAULT_ALLOWED_HOSTS.has(url.hostname)
}

function parseAllowedOrigins(value: string | undefined): Set<string> {
  if (!value) return new Set()

  return new Set(
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
}
