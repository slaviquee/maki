#!/usr/bin/env node
process.title = 'maki'

import { buildPiArgs, getRuntimePaths, isAgentLaunch, isSetupCommand, isSignerCommand } from './launcher/args.js'
import { bootstrap } from './config/bootstrap.js'
import { runSignerCommand } from './launcher/signer.js'
import { runSetupWizard } from './launcher/setup.js'

async function run(): Promise<void> {
  const runtimePaths = getRuntimePaths(import.meta.url)
  process.env.PI_CODING_AGENT_DIR ??= runtimePaths.agentDir

  const args = process.argv.slice(2)

  if (isSetupCommand(args)) {
    await runSetupWizard(runtimePaths.packageRoot, false)
    return
  }

  if (isSignerCommand(args)) {
    await runSignerCommand(args.slice(1), runtimePaths.packageRoot)
    return
  }

  if (isAgentLaunch(args)) {
    const config = bootstrap()
    if (inputIsInteractive() && !config.setupComplete) {
      await runSetupWizard(runtimePaths.packageRoot, true)
    }
  }

  const { main } = await import('@mariozechner/pi-coding-agent')
  await main(buildPiArgs(args, runtimePaths))
}

function inputIsInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`maki error: ${message}`)
  process.exit(1)
})
