import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { bootstrap } from '../config/bootstrap.js'
import { createBaseClient } from '../wallet-core/client.js'
import { createPolicyStore } from '../policy/store.js'
import { createSpendingTracker } from '../policy/spending-tracker.js'
import { createAuditLog } from '../wallet-core/audit-log.js'
import { createMockSigner } from '../signer/mock-signer.js'
import { createSignerIpcClient } from '../signer/ipc-client.js'
import { chainName } from '../wallet-core/chains.js'
import { registerWalletTools } from './wallet-tools.js'
import { registerBalanceTools } from './balance-tools.js'
import { registerEnsTools } from './ens-tools.js'
import { registerAllowanceTools } from './allowance-tools.js'
import { registerSignerTools } from './signer-tools.js'
import { registerDoctorTool } from './doctor-tool.js'
import { registerAccountTools } from './account-tools.js'
import { registerSimulationTools } from './simulation-tools.js'
import { registerTransferTools } from './transfer-tools.js'
import { registerRevokeTools } from './revoke-tools.js'
import { registerSwapTools } from './swap-tools.js'
import { registerPolicyTools } from './policy-tools.js'
import { registerAaveTools } from './aave-tools.js'
import { registerRecurringTools } from './recurring-tools.js'
import { registerAuditTools } from './audit-tools.js'
import type { MakiContext, SignerMode } from './context.js'

export default function makiExtension(pi: ExtensionAPI) {
  let ctx: MakiContext | undefined

  const getCtx = (): MakiContext => {
    if (!ctx) throw new Error('Maki not initialized — wait for session start')
    return ctx
  }

  pi.on('session_start', async (_event, extCtx) => {
    const config = bootstrap()
    const policy = createPolicyStore(config.policyPath)
    const chainClient = createBaseClient(config.chainId, config.rpcUrl)
    const spending = createSpendingTracker(config.dbPath)
    const auditLog = createAuditLog(config.dbPath)

    // Connect to signer
    let signer
    let signerMode: SignerMode
    if (config.signerType === 'mock') {
      signer = createMockSigner()
      signerMode = 'mock'
    } else {
      signer = createSignerIpcClient(config.socketPath)
      try {
        await signer.connect()
        // Query the daemon to determine whether it uses Secure Enclave or mock backend
        const status = await signer.status()
        signerMode = status.signerType === 'secure-enclave' ? 'secure-enclave' : 'ipc'
      } catch (err) {
        // Surface the failure clearly — do NOT silently fallback
        signer = createMockSigner()
        signerMode = 'mock-fallback'
        const message = err instanceof Error ? err.message : 'Unknown error'
        if (extCtx.hasUI) {
          extCtx.ui.notify(
            `Signer daemon not available (${message}). Running in mock mode — write actions use a dummy signer. Start the signer daemon for real signing.`,
            'warning',
          )
        }
        auditLog.log('write_denied', `Signer daemon unavailable, fell back to mock: ${message}`)
      }
    }

    ctx = { config, signer, signerMode, policy, chainClient, spending, auditLog }

    if (extCtx.hasUI) {
      const signerLabel =
        signerMode === 'secure-enclave'
          ? 'Secure Enclave'
          : signerMode === 'mock-fallback'
            ? 'MOCK (daemon unavailable)'
            : signerMode === 'mock'
              ? 'MOCK'
              : 'IPC'
      extCtx.ui.setStatus('maki', `maki | ${chainName(config.chainId)} | ${signerLabel}`)
    }
  })

  pi.on('session_shutdown', async () => {
    ctx?.signer.disconnect()
    ctx = undefined
  })

  // Register all tools
  registerWalletTools(pi, getCtx)
  registerBalanceTools(pi, getCtx)
  registerEnsTools(pi)
  registerAllowanceTools(pi, getCtx)
  registerSignerTools(pi, getCtx)
  registerDoctorTool(pi, getCtx)
  registerAccountTools(pi, getCtx)
  registerSimulationTools(pi, getCtx)
  registerTransferTools(pi, getCtx)
  registerRevokeTools(pi, getCtx)
  registerSwapTools(pi, getCtx)
  registerPolicyTools(pi, getCtx)
  registerAaveTools(pi, getCtx)
  registerRecurringTools(pi, getCtx)
  registerAuditTools(pi, getCtx)
}
