import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { bootstrap } from '../config/bootstrap.js'
import { createBaseClient } from '../wallet-core/client.js'
import { createPolicyStore } from '../policy/store.js'
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
import type { MakiContext } from './context.js'

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

    // Connect to signer: use mock if configured, otherwise try IPC
    let signer
    if (config.signerType === 'mock') {
      signer = createMockSigner()
    } else {
      signer = createSignerIpcClient(config.socketPath)
      try {
        await signer.connect()
      } catch {
        // Fall back to mock if daemon not running
        signer = createMockSigner()
      }
    }

    ctx = { config, signer, policy, chainClient }

    if (extCtx.hasUI) {
      extCtx.ui.setStatus('maki', `maki | ${chainName(config.chainId)}`)
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
}
