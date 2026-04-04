import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify as yamlStringify, parse as yamlParse } from 'yaml'
import { paths } from './paths.js'
import type { MakiConfig } from './types.js'
import { defaultPolicy } from '../policy/defaults.js'

const DEFAULT_CONFIG = {
  chainId: 84532 as const,
  rpcUrl: 'https://sepolia.base.org',
  signerType: 'mock' as const,
  setupComplete: false,
}

function inferSetupComplete(raw: Record<string, unknown>): boolean {
  if (typeof raw['setupComplete'] === 'boolean') {
    return raw['setupComplete']
  }

  return (
    typeof raw['smartAccountAddress'] === 'string' ||
    typeof raw['bundlerApiKey'] === 'string' ||
    raw['signerType'] === 'secure-enclave'
  )
}

export function bootstrap(): MakiConfig {
  // Create directory structure
  const agentDir = join(paths.root, 'agent')
  for (const dir of [paths.root, paths.dbDir, paths.keysDir, agentDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  // Suppress Pi's default startup header so the Maki-branded header takes over
  const agentSettings = join(agentDir, 'settings.json')
  if (!existsSync(agentSettings)) {
    writeFileSync(agentSettings, JSON.stringify({ quietStartup: true }, null, 2), 'utf-8')
  } else {
    try {
      const existing = JSON.parse(readFileSync(agentSettings, 'utf-8')) as Record<string, unknown>
      if (existing['quietStartup'] !== true) {
        existing['quietStartup'] = true
        writeFileSync(agentSettings, JSON.stringify(existing, null, 2), 'utf-8')
      }
    } catch {
      // Corrupted settings — rewrite
      writeFileSync(agentSettings, JSON.stringify({ quietStartup: true }, null, 2), 'utf-8')
    }
  }

  // Write default config if missing
  if (!existsSync(paths.config)) {
    writeFileSync(paths.config, yamlStringify(DEFAULT_CONFIG), 'utf-8')
  }

  // Write default policy if missing
  if (!existsSync(paths.policy)) {
    writeFileSync(paths.policy, yamlStringify(defaultPolicy('locked')), 'utf-8')
  }

  // Read config
  const raw = yamlParse(readFileSync(paths.config, 'utf-8')) as Record<string, unknown>

  return {
    chainId: (raw['chainId'] as MakiConfig['chainId']) ?? 84532,
    rpcUrl: (raw['rpcUrl'] as string) ?? 'https://sepolia.base.org',
    socketPath: paths.socket,
    policyPath: paths.policy,
    configPath: paths.config,
    dbPath: paths.db,
    signerType: (raw['signerType'] as MakiConfig['signerType']) ?? 'none',
    setupComplete: inferSetupComplete(raw),
    smartAccountAddress: raw['smartAccountAddress'] as `0x${string}` | undefined,
    bundlerApiKey: (raw['bundlerApiKey'] as string) ?? undefined,
    uniswapApiKey: (raw['uniswapApiKey'] as string) ?? undefined,
  }
}

/**
 * Persists a single config field to ~/.maki/config.yaml.
 * Reads the current file, merges the field, writes back.
 */
export function saveConfigField(key: string, value: unknown): void {
  const raw = yamlParse(readFileSync(paths.config, 'utf-8')) as Record<string, unknown>
  raw[key] = value
  writeFileSync(paths.config, yamlStringify(raw), 'utf-8')
}
