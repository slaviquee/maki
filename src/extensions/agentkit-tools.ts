import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { accessProtectedEndpoint, validateTrustedAgentkitUrl } from '../adapters/agentkit/index.js'
import type { MakiContext } from './context.js'

const DEFAULT_DEMO_URL = 'http://localhost:4021/protected'

export function registerAgentkitTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'agentkit_verify',
    label: 'AgentKit Verify',
    description:
      'Test access to a World AgentKit-protected endpoint. ' +
      'Makes an initial request, handles the 402 challenge-response by signing a SIWE message ' +
      'with the Maki smart wallet, and retries with verification. ' +
      'Shows whether Maki is recognized as a human-backed agent.',
    promptSnippet: 'agentkit_verify: test AgentKit-protected endpoint access — proves Maki is a human-backed agent',
    parameters: Type.Object({
      url: Type.Optional(
        Type.String({
          description: `URL of the AgentKit-protected endpoint. Defaults to ${DEFAULT_DEMO_URL}`,
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const url = (params as { url?: string }).url ?? DEFAULT_DEMO_URL
      const trustCheck = validateTrustedAgentkitUrl(url)

      if (!trustCheck.ok) {
        return {
          content: [{ type: 'text' as const, text: trustCheck.error ?? 'Untrusted AgentKit URL' }],
          details: { url, trusted: false },
        }
      }

      const result = await accessProtectedEndpoint(
        {
          signer: maki.signer,
          chainClient: maki.chainClient,
          chainId: maki.config.chainId,
          smartAccountAddress: maki.config.smartAccountAddress,
        },
        url,
      )

      const lines: string[] = []

      if (result.verified) {
        lines.push('AgentKit verification: PASSED')
        lines.push(`Status: ${result.status}`)
        lines.push(`Response: ${JSON.stringify(result.body, null, 2)}`)
      } else if (result.error) {
        lines.push('AgentKit verification: FAILED')
        lines.push(`Status: ${result.status}`)
        lines.push(`Error: ${result.error}`)
        lines.push(`Response: ${JSON.stringify(result.body, null, 2)}`)
      } else {
        lines.push(`Request completed without AgentKit challenge`)
        lines.push(`Status: ${result.status}`)
        lines.push(`Response: ${JSON.stringify(result.body, null, 2)}`)
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: result,
      }
    },
  })
}
