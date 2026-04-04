import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { generateAllDescriptors, validateDescriptor } from '../clear-signing/erc7730.js'
import type { Erc7730Descriptor } from '../clear-signing/erc7730.js'

export function registerClearSigningTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'generate_clear_signing_descriptors',
    label: 'Generate Clear Signing Descriptors',
    description:
      'Generate ERC-7730 clear signing descriptors for Maki-supported ERC-20 actions (transfer, approve, revoke). Returns JSON descriptors that enable Ledger devices to display human-readable transaction details.',
    promptSnippet: 'generate_clear_signing_descriptors: create ERC-7730 descriptors for Ledger clear signing',
    promptGuidelines: [
      'Use when the user asks about clear signing, ERC-7730, or Ledger transaction display.',
      'Returns validated descriptors for the on-chain calldata shapes Maki currently supports accurately.',
    ],
    parameters: Type.Object({
      action: Type.Optional(
        Type.String({
          description: 'Specific action to generate descriptor for: "erc20-transfer", "erc20-approve", or "all"',
        }),
      ),
    }),

    async execute(_toolCallId, params) {
      const allDescriptors = generateAllDescriptors()
      const action = (params as { action?: string }).action ?? 'all'

      let selected: Record<string, Erc7730Descriptor>
      if (action === 'all') {
        selected = allDescriptors
      } else {
        selected = {}
        for (const [name, desc] of Object.entries(allDescriptors)) {
          if (name.includes(action.replace('erc20-', '').replace('uniswap-', ''))) {
            selected[name] = desc
          }
        }
      }

      if (Object.keys(selected).length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No descriptors found for action "${action}". Available: erc20-transfer, erc20-approve, all`,
            },
          ],
          details: undefined,
        }
      }

      const results: string[] = []
      for (const [name, descriptor] of Object.entries(selected)) {
        const validation = validateDescriptor(descriptor)
        const status = validation.valid ? 'VALID' : `INVALID: ${validation.errors.join(', ')}`
        results.push(`--- ${name} [${status}] ---`)
        results.push(JSON.stringify(descriptor, null, 2))
        results.push('')
      }

      return {
        content: [{ type: 'text' as const, text: results.join('\n') }],
        details: {
          count: Object.keys(selected).length,
          descriptors: Object.keys(selected),
          allValid: Object.values(selected).every((d) => validateDescriptor(d).valid),
        },
      }
    },
  })
}
