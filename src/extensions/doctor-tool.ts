import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import type { MakiContext } from './context.js'

interface DoctorCheck {
  name: string
  status: 'ok' | 'warn' | 'fail'
  message: string
}

async function runDoctorChecks(ctx: MakiContext): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []

  // 1. Signer daemon
  try {
    const ping = await ctx.signer.ping()
    const signerStatus = await ctx.signer.status()
    let signerMessage: string
    if (signerStatus.signerType === 'ledger') {
      const transport = signerStatus.transport ?? 'unknown'
      const device = signerStatus.deviceConnected ? 'connected' : 'disconnected'
      const ethApp = signerStatus.ethereumAppOpen ? 'open' : 'not open'
      signerMessage = `Ledger (v${ping.version}), transport: ${transport}, device: ${device}, Ethereum app: ${ethApp}`
      if (signerStatus.address) {
        signerMessage += `, address: ${signerStatus.address.slice(0, 10)}...`
      }
    } else if (signerStatus.keyStorage === 'ephemeral') {
      signerMessage = `Connected (v${ping.version}), session-only Secure Enclave key`
    } else {
      signerMessage = `Connected (v${ping.version})`
    }
    checks.push({
      name: 'Signer daemon',
      status: ping.pong ? 'ok' : 'fail',
      message: ping.pong ? signerMessage : 'Not responding',
    })

    // Ledger-specific readiness checks
    if (signerStatus.signerType === 'ledger') {
      if (!signerStatus.deviceConnected) {
        checks.push({
          name: 'Ledger device',
          status: 'fail',
          message: 'Device not connected. Connect your Ledger and unlock it.',
        })
      } else if (!signerStatus.ethereumAppOpen) {
        checks.push({
          name: 'Ledger Ethereum app',
          status: 'fail',
          message: 'Ethereum app not open. Open the Ethereum app on your Ledger.',
        })
      } else {
        checks.push({
          name: 'Ledger device',
          status: 'ok',
          message: 'Device connected, Ethereum app open',
        })
      }
    }
  } catch {
    checks.push({ name: 'Signer daemon', status: 'fail', message: 'Cannot connect' })
  }

  // 2. RPC connection
  try {
    const blockNumber = await ctx.chainClient.getBlockNumber()
    checks.push({
      name: 'RPC connection',
      status: 'ok',
      message: `Connected, block #${blockNumber}`,
    })
  } catch (e) {
    checks.push({
      name: 'RPC connection',
      status: 'fail',
      message: `Cannot connect: ${e instanceof Error ? e.message : 'unknown'}`,
    })
  }

  // 3. Policy
  try {
    const policy = ctx.policy.load()
    checks.push({
      name: 'Policy',
      status: 'ok',
      message: `Profile: ${policy.profile}`,
    })
  } catch {
    checks.push({ name: 'Policy', status: 'fail', message: 'Invalid or missing' })
  }

  // 4. Account — depends on mode
  const isEoaDemo = ctx.config.ledger?.accountMode === 'eoa-demo' && ctx.config.signerType === 'ledger'

  if (isEoaDemo) {
    checks.push({
      name: 'Account mode',
      status: 'ok',
      message: 'Ledger EOA demo (direct transactions, no bundler)',
    })
    if (ctx.config.ledgerAddress) {
      checks.push({
        name: 'EOA address',
        status: 'ok',
        message: ctx.config.ledgerAddress,
      })
    } else {
      checks.push({
        name: 'EOA address',
        status: 'warn',
        message: 'Not set — run setup_ledger_account',
      })
    }
  } else {
    if (ctx.config.smartAccountAddress) {
      checks.push({
        name: 'Smart account',
        status: 'ok',
        message: ctx.config.smartAccountAddress,
      })
    } else {
      checks.push({
        name: 'Smart account',
        status: 'warn',
        message: 'Not deployed (read-only mode)',
      })
    }
  }

  return checks
}

function formatChecks(checks: DoctorCheck[]): string {
  return checks
    .map((c) => {
      const icon = c.status === 'ok' ? '[OK]' : c.status === 'warn' ? '[WARN]' : '[FAIL]'
      return `${icon} ${c.name}: ${c.message}`
    })
    .join('\n')
}

export function registerDoctorTool(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'doctor',
    label: 'Doctor',
    description: 'Run health checks on the maki setup: signer, RPC, policy, and smart account.',
    promptSnippet: 'doctor: run health checks on signer, RPC, policy, account',
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const checks = await runDoctorChecks(getCtx())
      return {
        content: [{ type: 'text' as const, text: formatChecks(checks) }],
        details: { checks },
      }
    },
  })

  pi.registerCommand('doctor', {
    description: 'Run maki health checks',
    handler: async (_args, ctx) => {
      const checks = await runDoctorChecks(getCtx())
      for (const c of checks) {
        const icon = c.status === 'ok' ? '[OK]' : c.status === 'warn' ? '[WARN]' : '[FAIL]'
        const type = c.status === 'fail' ? 'error' : c.status === 'warn' ? 'warning' : 'info'
        ctx.ui.notify(`${icon} ${c.name}: ${c.message}`, type)
      }
    },
  })
}
