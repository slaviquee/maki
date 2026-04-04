import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { accessProtectedEndpoint, validateTrustedAgentkitUrl } from '../adapters/agentkit/index.js'
import type { MakiContext } from './context.js'

const DEFAULT_DEMO_URL = 'http://localhost:4021/protected'

export function registerAgentkitTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  const parameters = Type.Object({
    url: Type.Optional(
      Type.String({
        description: `URL of the AgentKit-protected endpoint. Defaults to ${DEFAULT_DEMO_URL}`,
      }),
    ),
  })

  const execute = async (params: unknown) => {
    const maki = getCtx()
    const url = (params as { url?: string }).url ?? maki.config.world.defaultUrl ?? DEFAULT_DEMO_URL
    const allowedOrigins = maki.config.world.allowedOrigins.join(',')
    const trustCheck = validateTrustedAgentkitUrl(url, allowedOrigins)

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
  }

  const variants = [
    {
      name: 'agentkit_verify',
      label: 'AgentKit Verify',
      promptSnippet:
        'agentkit_verify: verify that Maki is a human-backed agent using World AgentKit against the local demo server',
    },
    {
      name: 'test_agentkit_access',
      label: 'Test AgentKit Access',
      promptSnippet:
        'test_agentkit_access: test agentkit access against the local World AgentKit demo server and verify the human-backed agent flow',
    },
    {
      name: 'verify_human_backed_agent',
      label: 'Verify Human-Backed Agent',
      promptSnippet: 'verify_human_backed_agent: verify that Maki represents a human-backed agent using World AgentKit',
    },
  ] as const

  for (const variant of variants) {
    pi.registerTool({
      name: variant.name,
      label: variant.label,
      description:
        'Test access to a World AgentKit-protected endpoint. ' +
        'Use this immediately when the user asks to test agentkit access, verify a human-backed agent, ' +
        'or mentions agentkit_verify. ' +
        'Defaults to the local demo endpoint and should not trigger repo exploration.',
      promptSnippet: variant.promptSnippet,
      parameters,
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        return execute(params)
      },
    })
  }
}
