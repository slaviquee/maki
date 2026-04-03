import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { resolveEns, reverseResolveEns } from '../wallet-core/ens.js'

export function registerEnsTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'resolve_ens',
    label: 'Resolve ENS',
    description: 'Resolve an ENS name to an address, or reverse-resolve an address to an ENS name.',
    promptSnippet: 'resolve_ens: resolve .eth names to addresses and vice versa',
    promptGuidelines: [
      'Use when the user mentions a .eth name or wants to look up who owns an address.',
      'ENS resolution happens on Ethereum mainnet.',
      'Always resolve ENS names before using them as transaction recipients.',
    ],
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: 'ENS name to resolve (e.g., vitalik.eth)' })),
      address: Type.Optional(Type.String({ description: 'Address to reverse-resolve to ENS name' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (params.name) {
        const result = await resolveEns(params.name)
        if (result.error) {
          throw new Error(`ENS resolution failed: ${result.error}`)
        }
        const text = result.address
          ? `${result.name} => ${result.address}${result.avatar ? ` (avatar: ${result.avatar})` : ''}`
          : `${result.name}: no address found`
        return {
          content: [{ type: 'text' as const, text }],
          details: result,
        }
      }

      if (params.address) {
        const name = await reverseResolveEns(params.address as `0x${string}`)
        const text = name ? `${params.address} => ${name}` : `${params.address}: no ENS name found`
        return {
          content: [{ type: 'text' as const, text }],
          details: { address: params.address, name },
        }
      }

      throw new Error('Provide either name or address')
    },
  })
}
