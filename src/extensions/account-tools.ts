import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { getSmartAccountInfo } from '../wallet-core/account.js'
import { chainName } from '../wallet-core/chains.js'
import type { MakiContext } from './context.js'

export function registerAccountTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'create_smart_account',
    label: 'Create Smart Account',
    description:
      'Create a new ERC-4337 smart account (Coinbase Smart Wallet) backed by the Secure Enclave signer. Returns the counterfactual address.',
    promptSnippet: 'create_smart_account: deploy a new smart account with the Secure Enclave key',
    promptGuidelines: [
      'Use when the user wants to set up their wallet for the first time.',
      'The account is counterfactual — the address is known before deployment.',
      'Actual on-chain deployment happens with the first UserOperation.',
    ],
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()

      // Ensure signer has a key
      await maki.signer.createKey()

      // Get account info
      const info = await getSmartAccountInfo(maki.chainClient, maki.signer)

      const lines = [
        `Smart Account created on ${chainName(maki.config.chainId)}`,
        `Address: ${info.address}`,
        `Deployed: ${info.isDeployed ? 'yes' : 'no (will deploy on first transaction)'}`,
        `Owner public key (P-256): ${info.ownerPublicKey.slice(0, 20)}...`,
        '',
        'Fund this address with ETH to start using it.',
      ]

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: {
          address: info.address,
          isDeployed: info.isDeployed,
          chainId: maki.config.chainId,
        },
      }
    },
  })

  pi.registerTool({
    name: 'get_account_info',
    label: 'Get Account Info',
    description: 'Get details about the smart account: address, deployment status, owner key.',
    promptSnippet: 'get_account_info: check smart account address and deployment status',
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const info = await getSmartAccountInfo(maki.chainClient, maki.signer)

      const lines = [
        `Address: ${info.address}`,
        `Chain: ${chainName(maki.config.chainId)}`,
        `Deployed: ${info.isDeployed}`,
        `Owner X: ${info.ownerX}`,
        `Owner Y: ${info.ownerY}`,
      ]

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: info,
      }
    },
  })
}
