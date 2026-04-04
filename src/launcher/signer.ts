import { existsSync, readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { parse as yamlParse } from 'yaml'
import { paths } from '../config/paths.js'
import type { LedgerConfig } from '../config/types.js'

function normalizeLedgerTransport(_value: unknown): LedgerConfig['transport'] {
  return 'speculos'
}

function signerBinaryCandidates(packageRoot: string): string[] {
  return [
    join(packageRoot, 'signer-daemon', '.build', 'arm64-apple-macosx', 'debug', 'maki-signer'),
    join(packageRoot, 'signer-daemon', '.build', 'x86_64-apple-macosx', 'debug', 'maki-signer'),
    join(packageRoot, 'signer-daemon', '.build', 'debug', 'maki-signer'),
  ]
}

export function findSignerBinary(packageRoot: string): string | undefined {
  return signerBinaryCandidates(packageRoot).find((candidate) => existsSync(candidate))
}

export function ensureSignerBinary(
  packageRoot: string,
): { ok: true; binaryPath: string } | { ok: false; error: string } {
  const existingBinary = findSignerBinary(packageRoot)
  if (existingBinary) {
    return { ok: true, binaryPath: existingBinary }
  }

  const build = spawnSync('swift', ['build'], {
    cwd: join(packageRoot, 'signer-daemon'),
    stdio: 'inherit',
  })

  if (build.status !== 0) {
    return {
      ok: false,
      error: 'Failed to build signer daemon. Install Xcode command line tools and run `maki signer start` again.',
    }
  }

  if (process.platform === 'darwin') {
    const sign = spawnSync(join(packageRoot, 'scripts', 'codesign-signer-dev.sh'), [], {
      cwd: packageRoot,
      stdio: 'inherit',
    })

    if (sign.status !== 0) {
      return {
        ok: false,
        error: 'Failed to codesign the signer daemon. Run `scripts/codesign-signer-dev.sh` manually and retry.',
      }
    }
  }

  const binaryPath = findSignerBinary(packageRoot)
  if (!binaryPath) {
    return { ok: false, error: 'Signer daemon build finished, but the binary could not be found.' }
  }

  return { ok: true, binaryPath }
}

function loadSignerTypeFromConfig(): { signerType: string; ledger?: LedgerConfig } {
  if (!existsSync(paths.config)) {
    return { signerType: 'secure-enclave' }
  }
  try {
    const raw = yamlParse(readFileSync(paths.config, 'utf-8')) as Record<string, unknown>
    const rawLedger = raw['ledger'] as Record<string, unknown> | undefined
    let ledger: LedgerConfig | undefined
    if (rawLedger) {
      ledger = {
        transport: normalizeLedgerTransport(rawLedger['transport']),
        derivationPath: (rawLedger['derivationPath'] as string) ?? "44'/60'/0'/0/0",
        speculosHost: rawLedger['speculosHost'] as string | undefined,
        speculosPort: rawLedger['speculosPort'] as number | undefined,
      }
    }
    return {
      signerType: (raw['signerType'] as string) ?? 'secure-enclave',
      ledger,
    }
  } catch {
    return { signerType: 'secure-enclave' }
  }
}

export async function runSignerCommand(args: string[], packageRoot: string): Promise<void> {
  const subcommand = !args[0] || args[0].startsWith('-') ? 'start' : args[0]

  if (subcommand !== 'start') {
    throw new Error(`Unknown signer subcommand "${subcommand}". Use \`maki signer start\`.`)
  }

  // Determine backend: --ledger flag overrides, then config, then default
  const forceLedger = args.includes('--ledger')
  const forceMock = args.includes('--mock')
  const config = loadSignerTypeFromConfig()

  if (forceLedger || (!forceMock && config.signerType === 'ledger')) {
    // Run the Ledger signer backend through the source entrypoint.
    // This avoids a broken ESM directory import in Ledger's packaged DMK bundle.
    const ledgerConfig = config.ledger ?? {
      transport: 'speculos' as const,
      derivationPath: "44'/60'/0'/0/0",
      speculosHost: '127.0.0.1',
      speculosPort: 5000,
    }

    console.warn('Starting Ledger signer backend...')
    console.warn(`Transport: ${ledgerConfig.transport}`)
    console.warn(`Derivation path: ${ledgerConfig.derivationPath}`)
    console.warn(`Speculos: ${ledgerConfig.speculosHost ?? '127.0.0.1'}:${ledgerConfig.speculosPort ?? 5000}`)

    const child = spawn(
      process.execPath,
      ['--import', 'tsx', join(packageRoot, 'src', 'signer', 'ledger-server-main.ts'), paths.socket, JSON.stringify(ledgerConfig)],
      {
        stdio: 'inherit',
        cwd: packageRoot,
      },
    )

    await new Promise<void>((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', (code, signal) => {
        if (signal) {
          process.kill(process.pid, signal)
          return
        }
        if (code && code !== 0) {
          reject(new Error(`Ledger signer backend exited with code ${code}`))
          return
        }
        resolve()
      })
    })
    return
  }

  // Default: run the Swift Secure Enclave signer daemon
  const buildResult = ensureSignerBinary(packageRoot)
  if (!buildResult.ok) {
    throw new Error(buildResult.error)
  }

  const childArgs = forceMock ? ['--mock', paths.socket] : [paths.socket]
  const child = spawn(buildResult.binaryPath, childArgs, {
    stdio: 'inherit',
  })

  await new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal)
        return
      }
      if (code && code !== 0) {
        reject(new Error(`Signer daemon exited with code ${code}`))
        return
      }
      resolve()
    })
  })
}
