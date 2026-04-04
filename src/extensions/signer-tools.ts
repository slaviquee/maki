import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import type { MakiContext } from './context.js'

export function registerSignerTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'signer_status',
    label: 'Signer Status',
    description: 'Check if the signer daemon is connected and has a key available.',
    promptSnippet: 'signer_status: check signer daemon connectivity and key status',
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()

      try {
        const status = await maki.signer.status()
        const lines = [
          `Signer: ${status.ready ? 'ready' : 'not ready'}`,
          `Type: ${status.signerType}`,
          `Has key: ${status.hasKey}`,
          ...(status.keyStorage ? [`Key storage: ${status.keyStorage}`] : []),
          ...(status.publicKey ? [`Public key: ${status.publicKey.slice(0, 20)}...`] : []),
        ]
        // Ledger-specific status fields
        if (status.signerType === 'ledger') {
          lines.push(`Transport: ${status.transport ?? 'unknown'}`)
          lines.push(`Device connected: ${status.deviceConnected ? 'yes' : 'no'}`)
          lines.push(`Ethereum app open: ${status.ethereumAppOpen ? 'yes' : 'no'}`)
          if (status.address) {
            lines.push(`Ledger address: ${status.address}`)
          }
        }
        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
          details: status,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return {
          content: [{ type: 'text' as const, text: `Signer unavailable: ${message}` }],
          details: { ready: false, error: message },
        }
      }
    },
  })
}
