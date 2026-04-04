import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { paths } from '../config/paths.js'

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

export async function runSignerCommand(args: string[], packageRoot: string): Promise<void> {
  const subcommand = !args[0] || args[0].startsWith('-') ? 'start' : args[0]

  if (subcommand !== 'start') {
    throw new Error(`Unknown signer subcommand "${subcommand}". Use \`maki signer start\`.`)
  }

  const buildResult = ensureSignerBinary(packageRoot)
  if (!buildResult.ok) {
    throw new Error(buildResult.error)
  }

  const childArgs = args.includes('--mock') ? ['--mock', paths.socket] : [paths.socket]
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
