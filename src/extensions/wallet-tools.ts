import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { chainName } from '../wallet-core/chains.js'
import type { MakiContext } from './context.js'

export function registerWalletTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'wallet_status',
    label: 'Wallet Status',
    description: 'Get the current wallet status: address, chain, signer status, and security profile.',
    promptSnippet: 'wallet_status: check wallet address, chain, signer, and policy profile',
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const signerStatus = await maki.signer.status()
      const policy = maki.policy.load()

      const lines = [
        `Chain: ${chainName(maki.config.chainId)}`,
        `Signer: ${signerStatus.ready ? 'connected' : 'disconnected'} (${signerStatus.signerType})`,
        `Has key: ${signerStatus.hasKey}`,
        ...(maki.accountMode === 'eoa-demo'
          ? [
              `Account mode: Ledger EOA demo`,
              maki.config.ledgerAddress
                ? `EOA address: ${maki.config.ledgerAddress}`
                : 'EOA address: not set (run setup_ledger_account)',
            ]
          : [
              maki.config.smartAccountAddress
                ? `Smart account: ${maki.config.smartAccountAddress}`
                : 'Smart account: not deployed',
            ]),
        `Security profile: ${policy.profile}`,
      ]

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: { signerStatus, profile: policy.profile },
      }
    },
  })
}
