import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { bootstrap } from '../config/bootstrap.js'
import { paths } from '../config/paths.js'
import type { LedgerConfig, LedgerTransport, MakiConfig, SupportedChainId } from '../config/types.js'
import { defaultPolicy } from '../policy/defaults.js'
import type { Policy, SecurityProfile } from '../policy/types.js'
import { ensureSignerBinary } from './signer.js'
import {
  DEFAULT_WORLD_AGENTKIT_URL,
  defaultAllowedOrigins,
  normalizeWorldUrl,
  parseAllowedOrigins,
  registerWorldAgent,
} from './world.js'

export function inferSetupComplete(raw: Record<string, unknown>): boolean {
  if (typeof raw['setupComplete'] === 'boolean') {
    return raw['setupComplete']
  }

  return (
    typeof raw['smartAccountAddress'] === 'string' ||
    typeof raw['bundlerApiKey'] === 'string' ||
    raw['signerType'] === 'secure-enclave' ||
    raw['signerType'] === 'ledger'
  )
}

export function defaultRpcUrl(chainId: SupportedChainId): string {
  switch (chainId) {
    case 8453:
      return 'https://mainnet.base.org'
    case 84532:
      return 'https://sepolia.base.org'
    case 11155111:
      return 'https://ethereum-sepolia-rpc.publicnode.com'
  }
}

function policyChainName(chainId: SupportedChainId): Policy['account']['chain'] {
  switch (chainId) {
    case 8453:
      return 'base'
    case 84532:
      return 'base-sepolia'
    case 11155111:
      return 'ethereum-sepolia'
  }
}

function chainLabel(chainId: SupportedChainId): string {
  switch (chainId) {
    case 8453:
      return 'Base Mainnet'
    case 84532:
      return 'Base Sepolia'
    case 11155111:
      return 'Ethereum Sepolia'
  }
}

function chainAllowlistName(chainId: SupportedChainId): string {
  return chainId === 11155111 ? 'ethereum' : 'base'
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

  policy.account.chain = policyChainName(chainId)
  policy.allowlists.chains = [chainAllowlistName(chainId)]

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
  switch (value.trim()) {
    case '2':
      return 8453
    case '3':
      return 11155111
    default:
      return 84532
  }
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
  switch (value.trim()) {
    case '2':
      return 'ledger'
    case '3':
      return 'mock'
    default:
      return 'secure-enclave'
  }
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

  const chainChoice = await ask(
    'Network: [1] Base Sepolia (recommended), [2] Base Mainnet, [3] Ethereum Sepolia. Default 1: ',
  )
  const chainId = parseChainChoice(chainChoice)
  const signerChoice = await ask('Signer backend: [1] Secure Enclave (recommended), [2] Ledger, [3] Mock. Default 1: ')
  const signerType = parseSignerChoice(signerChoice)

  let ledgerConfig: LedgerConfig | undefined
  if (signerType === 'ledger') {
    const derivationPathInput = await ask("Derivation path (default: 44'/60'/0'/0/0): ")
    const derivationPath = derivationPathInput.trim() || "44'/60'/0'/0/0"
    const transport: LedgerTransport = 'speculos'
    const speculosHost = normalizeOptional(await ask('Speculos host (default: 127.0.0.1): ')) ?? '127.0.0.1'
    const portInput = await ask('Speculos HTTP port (default: 5000): ')
    const speculosPort = portInput.trim() ? parseInt(portInput.trim(), 10) : 5000

    ledgerConfig = { transport, derivationPath, speculosHost, speculosPort, accountMode: 'eoa-demo' }

    output.write('\nLedger setup notes:\n')
    output.write(`  Account mode: EOA demo (direct transactions, no bundler needed)\n`)
    output.write(`  Speculos emulator: ${speculosHost}:${speculosPort}\n`)
    output.write('  Start Speculos before running: maki signer start\n')
    output.write('  Physical USB Ledger transport is deferred in this build.\n')
    output.write(`  Derivation path: ${derivationPath}\n\n`)
  }
  const bundlerApiKey = normalizeOptional(
    await ask('Pimlico bundler API key (optional now, needed for live writes). Leave blank to skip: '),
  )
  const uniswapApiKey = normalizeOptional(
    await ask('Uniswap API key (optional, enables optimized swap routing via Trading API). Leave blank to skip: '),
  )
  const enableWorld = ['y', 'yes'].includes(
    (await ask('Enable World AgentKit demo flow? [y/N]: ')).trim().toLowerCase(),
  )
  let worldEnabled = false
  let worldDefaultUrl = DEFAULT_WORLD_AGENTKIT_URL
  let worldAllowedOrigins: string[] = []
  let worldRegistered = false
  let worldRegistrationTx: `0x${string}` | undefined

  if (enableWorld) {
    worldEnabled = true
    worldDefaultUrl = normalizeWorldUrl(
      await ask(`World AgentKit default URL. Leave blank for ${DEFAULT_WORLD_AGENTKIT_URL}: `),
    )
    const allowedOriginsInput = await ask(
      'Allowed remote origins (comma-separated, optional). Leave blank to keep loopback-only or use the default URL origin: ',
    )
    worldAllowedOrigins = allowedOriginsInput.trim()
      ? parseAllowedOrigins(allowedOriginsInput)
      : defaultAllowedOrigins(worldDefaultUrl)
  }
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

  if (uniswapApiKey) {
    raw['uniswapApiKey'] = uniswapApiKey
  } else {
    delete raw['uniswapApiKey']
  }

  if (ledgerConfig) {
    raw['ledger'] = {
      transport: ledgerConfig.transport,
      derivationPath: ledgerConfig.derivationPath,
      ...(ledgerConfig.speculosHost ? { speculosHost: ledgerConfig.speculosHost } : {}),
      ...(ledgerConfig.speculosPort ? { speculosPort: ledgerConfig.speculosPort } : {}),
      ...(ledgerConfig.accountMode ? { accountMode: ledgerConfig.accountMode } : {}),
    }
  } else {
    delete raw['ledger']
  }

  raw['world'] = {
    enabled: worldEnabled,
    defaultUrl: worldDefaultUrl,
    allowedOrigins: worldAllowedOrigins,
    registered: false,
  }

  const existingSmartAccountAddress = raw['smartAccountAddress'] as `0x${string}` | undefined

  if (worldEnabled && existingSmartAccountAddress) {
    const registerNow = ['y', 'yes'].includes(
      (await ask('Register this smart account with World AgentKit now? [y/N]: ')).trim().toLowerCase(),
    )
    if (registerNow) {
      const result = await registerWorldAgent(existingSmartAccountAddress)
      worldRegistered = result.ok
      worldRegistrationTx = result.tx
      raw['world'] = {
        enabled: worldEnabled,
        defaultUrl: worldDefaultUrl,
        allowedOrigins: worldAllowedOrigins,
        registered: worldRegistered,
        registrationTx: worldRegistrationTx,
      }
    }
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

  if (signerType === 'ledger') {
    output.write('\nLedger signer uses the TypeScript Ledger DMK backend (no Swift build needed).\n')
  }

  output.write('\nSetup saved.\n')
  output.write(`Network: ${chainLabel(chainId)}\n`)
  output.write(`Signer: ${signerType}\n`)
  output.write(`Profile: ${profile}\n`)
  if (worldEnabled) {
    output.write(`World AgentKit: enabled (${worldDefaultUrl})\n`)
    if (worldAllowedOrigins.length > 0) {
      output.write(`Allowed origins: ${worldAllowedOrigins.join(', ')}\n`)
    }
    if (worldRegistered) {
      output.write('World registration: complete\n')
      if (worldRegistrationTx) {
        output.write(`World registration tx: ${worldRegistrationTx}\n`)
      }
    } else if (existingSmartAccountAddress) {
      output.write('World registration: not completed yet\n')
    }
  }
  if (ledgerConfig) {
    output.write(`Ledger transport: ${ledgerConfig.transport}\n`)
    output.write(`Derivation path: ${ledgerConfig.derivationPath}\n`)
    output.write(`Speculos: ${ledgerConfig.speculosHost ?? '127.0.0.1'}:${ledgerConfig.speculosPort ?? 5000}\n`)
  }
  output.write('\nNext steps:\n')
  if (signerType === 'ledger') {
    output.write('1. Start Speculos: speculos path/to/app-ethereum/build/nanos2/bin/app.elf\n')
    output.write('2. In another terminal, run: maki signer start\n')
    output.write('3. In Maki, run /login to pick your model provider\n')
    output.write('4. Ask: Setup my ledger account\n')
    output.write('5. Fund the EOA address and ask Maki to send ETH\n')
  } else {
    output.write('1. In another terminal, run: maki signer start\n')
    output.write('2. In Maki, run /login to pick your model provider\n')
    output.write('3. Ask: Create my smart account\n')
    output.write('4. Fund the address and ask Maki to check balances, swap, or send funds\n')
  }
  if (worldEnabled) {
    if (existingSmartAccountAddress) {
      output.write('5. Use /world status or /world register inside Maki for the World AgentKit demo flow\n')
    } else {
      output.write('5. After creating your smart account, run `maki world register` or `/world register`\n')
    }
  }

  if (launchAfterSetup) {
    output.write('\nLaunching Maki chat...\n\n')
  } else {
    output.write('\nRun `maki` when you are ready to chat.\n')
  }
}
