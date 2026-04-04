import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { bootstrap } from '../config/bootstrap.js'
import { paths } from '../config/paths.js'
import type { MakiConfig, WorldAgentkitConfig } from '../config/types.js'

export const DEFAULT_WORLD_AGENTKIT_URL = 'http://localhost:4021/protected'

export interface WorldRegistrationResult {
  ok: boolean
  tx?: `0x${string}`
}

export function normalizeWorldUrl(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_WORLD_AGENTKIT_URL
}

export function parseAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function defaultAllowedOrigins(url: string): string[] {
  try {
    const origin = new URL(url).origin
    if (origin === 'http://localhost:4021' || origin === 'http://127.0.0.1:4021') {
      return []
    }
    return [origin]
  } catch {
    return []
  }
}

export function worldStatusText(config: Pick<MakiConfig, 'smartAccountAddress' | 'world'>): string {
  const lines = [
    'World AgentKit',
    `Enabled: ${config.world.enabled ? 'yes' : 'no'}`,
    `Registered: ${config.world.registered ? 'yes' : 'no'}`,
    `Smart account: ${config.smartAccountAddress ?? '(missing)'}`,
    `Default URL: ${config.world.defaultUrl ?? DEFAULT_WORLD_AGENTKIT_URL}`,
    `Allowed origins: ${config.world.allowedOrigins.length > 0 ? config.world.allowedOrigins.join(', ') : '(loopback only)'}`,
  ]

  if (config.world.registrationTx) {
    lines.push(`Registration tx: ${config.world.registrationTx}`)
  }

  if (!config.smartAccountAddress) {
    lines.push('Next step: create your smart account before World registration.')
  } else if (!config.world.registered) {
    lines.push('Next step: run `maki world register` in another terminal or `/world register` for instructions.')
  }

  return lines.join('\n')
}

export async function runWorldCommand(args: string[]): Promise<void> {
  const config = bootstrap()
  const subcommand = args[0]?.trim().toLowerCase() || 'status'

  if (subcommand === 'status') {
    process.stdout.write(`${worldStatusText(config)}\n`)
    return
  }

  if (subcommand === 'register') {
    if (!config.smartAccountAddress) {
      throw new Error('Create your smart account first, then retry `maki world register`.')
    }

    const result = await registerWorldAgent(config.smartAccountAddress)
    if (!result.ok) {
      throw new Error('World AgentKit registration did not complete successfully.')
    }

    updateWorldConfig({
      registered: true,
      registrationTx: result.tx,
    })

    process.stdout.write('World AgentKit registration complete.\n')
    if (result.tx) {
      process.stdout.write(`Tx: ${result.tx}\n`)
    }
    return
  }

  throw new Error(`Unknown world subcommand "${subcommand}". Use \`maki world status\` or \`maki world register\`.`)
}

export async function registerWorldAgent(address: `0x${string}`): Promise<WorldRegistrationResult> {
  process.stdout.write('World registration opens a World App verification flow.\n')
  process.stdout.write('Use the QR code with the World App on your phone.\n')
  process.stdout.write('If only a link appears, open it on your phone or scan it from the terminal.\n\n')

  return await new Promise<WorldRegistrationResult>((resolve, reject) => {
    const child = spawn('npx', ['--yes', '@worldcoin/agentkit-cli', 'register', address], {
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: false })
        return
      }

      resolve({
        ok: true,
      })
    })
  })
}

export function updateWorldConfig(partial: Partial<WorldAgentkitConfig>): void {
  const raw = (yamlParse(readFileSync(paths.config, 'utf-8')) as Record<string, unknown> | null) ?? {}
  const existing = (raw['world'] as Record<string, unknown> | undefined) ?? {}
  raw['world'] = {
    ...existing,
    ...partial,
  }
  writeFileSync(paths.config, yamlStringify(raw), 'utf-8')
}
