import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { bootstrap } from '../config/bootstrap.js'
import { paths } from '../config/paths.js'
import type { MakiConfig, SupportedChainId } from '../config/types.js'
import { defaultPolicy } from '../policy/defaults.js'
import type { Policy, SecurityProfile } from '../policy/types.js'
import { ensureSignerBinary } from './signer.js'

export function inferSetupComplete(raw: Record<string, unknown>): boolean {
  if (typeof raw['setupComplete'] === 'boolean') {
    return raw['setupComplete']
  }

  return (
    typeof raw['smartAccountAddress'] === 'string' ||
    typeof raw['bundlerApiKey'] === 'string' ||
    raw['signerType'] === 'secure-enclave'
  )
}

export function defaultRpcUrl(chainId: SupportedChainId): string {
  return chainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org'
}

function loadRawConfig(): Record<string, unknown> {
  if (!existsSync(paths.config)) {
    bootstrap()
  }

  return (yamlParse(readFileSync(paths.config, 'utf-8')) as Record<string, unknown> | null) ?? {}
}

function writeRawConfig(raw: Record<string, unknown>): void {
  writeFileSync(paths.config, yamlStringify(raw), 'utf-8')
}

function loadCurrentPolicy(): Policy | undefined {
  if (!existsSync(paths.policy)) {
    return undefined
  }

  try {
    return yamlParse(readFileSync(paths.policy, 'utf-8')) as Policy
  } catch {
    return undefined
  }
}

function writeSetupPolicy(profile: SecurityProfile, chainId: SupportedChainId, recoveryAddress?: `0x${string}`): void {
  const existing = loadCurrentPolicy()
  const policy = defaultPolicy(profile)

  policy.account.chain = chainId === 8453 ? 'base' : 'base-sepolia'

  if (existing?.allowlists) {
    policy.allowlists = existing.allowlists
  }

  if (existing?.account?.recovery_address) {
    policy.account.recovery_address = existing.account.recovery_address
  }

  if (recoveryAddress) {
    policy.account.recovery_address = recoveryAddress
  }

  writeFileSync(paths.policy, yamlStringify(policy), 'utf-8')
}

function parseChainChoice(value: string): SupportedChainId {
  return value.trim() === '2' ? 8453 : 84532
}

function parseProfileChoice(value: string): SecurityProfile {
  switch (value.trim()) {
    case '2':
      return 'balanced'
    case '3':
      return 'relaxed'
    default:
      return 'locked'
  }
}

function parseSignerChoice(value: string): MakiConfig['signerType'] {
  return value.trim() === '2' ? 'mock' : 'secure-enclave'
}

function normalizeOptional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeRecoveryAddress(value: string): `0x${string}` | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  if (!trimmed.startsWith('0x')) {
    throw new Error('Recovery address must start with 0x')
  }

  return trimmed as `0x${string}`
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input, output })

  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

export async function runSetupWizard(packageRoot: string, launchAfterSetup: boolean): Promise<void> {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Interactive setup requires a TTY terminal.')
  }

  bootstrap()

  output.write('\nMaki first-time setup\n')
  output.write('This will prepare ~/.maki for interactive wallet use.\n')
  output.write('Model login still happens inside the chat shell via /login.\n\n')

  const chainChoice = await ask('Network: [1] Base Sepolia (recommended), [2] Base Mainnet. Default 1: ')
  const chainId = parseChainChoice(chainChoice)
  const signerChoice = await ask('Signer backend: [1] Secure Enclave (recommended), [2] Mock. Default 1: ')
  const signerType = parseSignerChoice(signerChoice)
  const bundlerApiKey = normalizeOptional(
    await ask('Pimlico bundler API key (optional now, needed for live writes). Leave blank to skip: '),
  )
  const recoveryAddress = normalizeRecoveryAddress(
    await ask('Recovery address (optional, 0x... format). Leave blank to skip: '),
  )
  const profileChoice = await ask('Security profile: [1] Locked, [2] Balanced, [3] Relaxed. Default 1: ')
  const profile = parseProfileChoice(profileChoice)

  const raw = loadRawConfig()
  raw['chainId'] = chainId
  raw['rpcUrl'] = defaultRpcUrl(chainId)
  raw['signerType'] = signerType
  raw['setupComplete'] = true

  if (bundlerApiKey) {
    raw['bundlerApiKey'] = bundlerApiKey
  } else {
    delete raw['bundlerApiKey']
  }

  writeRawConfig(raw)
  writeSetupPolicy(profile, chainId, recoveryAddress)

  if (signerType === 'secure-enclave') {
    const buildNow = await ask('Build and codesign the native signer daemon now? [Y/n]: ')
    if (!buildNow.trim() || buildNow.trim().toLowerCase() === 'y' || buildNow.trim().toLowerCase() === 'yes') {
      const buildResult = ensureSignerBinary(packageRoot)
      if (!buildResult.ok) {
        output.write(`\nSigner setup warning: ${buildResult.error}\n`)
      }
    }
  }

  output.write('\nSetup saved.\n')
  output.write(`Network: ${chainId === 8453 ? 'Base Mainnet' : 'Base Sepolia'}\n`)
  output.write(`Signer: ${signerType}\n`)
  output.write(`Profile: ${profile}\n`)
  output.write('\nNext steps:\n')
  output.write('1. In another terminal, run: maki signer start\n')
  output.write('2. In Maki, run /login to pick your model provider\n')
  output.write('3. Ask: Create my smart account\n')
  output.write('4. Fund the address and ask Maki to check balances, swap, or send funds\n')

  if (launchAfterSetup) {
    output.write('\nLaunching Maki chat...\n\n')
  } else {
    output.write('\nRun `maki` when you are ready to chat.\n')
  }
}
