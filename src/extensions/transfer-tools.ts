import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { buildErc20Transfer, buildNativeTransfer } from '../adapters/erc20/index.js'
import { findToken } from '../wallet-core/tokens.js'
import { resolveEns } from '../wallet-core/ens.js'
import { executeWriteAction } from '../wallet-core/execute.js'
import { getUsdcSpendingCapAmount } from '../wallet-core/spending-cap.js'
import { submitApproved } from './submit-helper.js'

import type { MakiContext } from './context.js'

export function registerTransferTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'send_eth',
    label: 'Send ETH',
    description: 'Send native ETH to an address or ENS name. Requires approval.',
    promptSnippet: 'send_eth: transfer ETH to an address (requires approval)',
    promptGuidelines: [
      'Always resolve ENS names before sending.',
      'Always confirm the amount and recipient with the user before executing.',
      'This is a write action — it will go through policy check, simulation, and approval.',
    ],
    parameters: Type.Object({
      to: Type.String({ description: 'Recipient address or ENS name' }),
      amount: Type.String({ description: 'Amount of ETH to send (e.g. "0.1")' }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const from = maki.config.smartAccountAddress
      if (!from) throw new Error('No smart account configured. Run create_smart_account first.')

      let to = params.to as `0x${string}`
      if (params.to.endsWith('.eth')) {
        const resolved = await resolveEns(params.to)
        if (!resolved.address) throw new Error(`Could not resolve ${params.to}`)
        to = resolved.address
      }

      const call = buildNativeTransfer(to, params.amount)
      const amountUsdc = getUsdcSpendingCapAmount('ETH', params.amount)

      let result = await executeWriteAction(
        {
          plan: {
            calls: [call],
            description: `Send ${params.amount} ETH to ${params.to}`,
            actionClass: 1,
          },
          policyDetails: {
            type: 'transfer',
            recipient: to,
            token: 'ETH',
            amountUsdc,
          },
        },
        maki.chainClient,
        maki.signer,
        maki.policy,
        from,
        maki.spending,
        maki.auditLog,
      )

      if (result.status === 'approved') {
        result = await submitApproved(maki, [call], result)
      }

      if (result.status === 'confirmed') {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Transfer confirmed on-chain.\nTx: ${result.txHash}\nUserOp: ${result.userOpHash}\n\n${result.summary}`,
            },
          ],
          details: result,
        }
      }

      if (result.status === 'approved') {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Transfer approved.\n${result.error ?? ''}\n\n${result.summary}`.trim(),
            },
          ],
          details: result,
        }
      }

      return {
        content: [{ type: 'text' as const, text: `Transfer blocked: ${result.error}\n\n${result.summary}` }],
        details: result,
      }
    },
  })

  pi.registerTool({
    name: 'transfer_token',
    label: 'Transfer Token',
    description: 'Transfer an ERC-20 token to an address or ENS name. Requires approval.',
    promptSnippet: 'transfer_token: send ERC-20 tokens to an address (requires approval)',
    promptGuidelines: [
      'Resolve ENS names before sending.',
      'Check that the token is in the verified registry.',
      'Confirm amount and recipient with the user before executing.',
    ],
    parameters: Type.Object({
      token: Type.String({ description: 'Token symbol (e.g. "USDC") or contract address' }),
      to: Type.String({ description: 'Recipient address or ENS name' }),
      amount: Type.String({ description: 'Amount to send in human-readable form (e.g. "100" for 100 USDC)' }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const from = maki.config.smartAccountAddress
      if (!from) throw new Error('No smart account configured. Run create_smart_account first.')

      const tokenInfo = findToken(maki.config.chainId, params.token)
      if (!tokenInfo) {
        throw new Error(`Token "${params.token}" not found in verified registry. Only verified tokens are supported.`)
      }

      let to = params.to as `0x${string}`
      if (params.to.endsWith('.eth')) {
        const resolved = await resolveEns(params.to)
        if (!resolved.address) throw new Error(`Could not resolve ${params.to}`)
        to = resolved.address
      }

      const call = buildErc20Transfer({ token: tokenInfo, to, amount: params.amount })
      const amountUsdc = getUsdcSpendingCapAmount(tokenInfo.symbol, params.amount)

      let result = await executeWriteAction(
        {
          plan: {
            calls: [call],
            description: `Transfer ${params.amount} ${tokenInfo.symbol} to ${params.to}`,
            actionClass: 1,
          },
          policyDetails: {
            type: 'transfer',
            recipient: to,
            token: tokenInfo.symbol,
            amountUsdc,
          },
        },
        maki.chainClient,
        maki.signer,
        maki.policy,
        from,
        maki.spending,
        maki.auditLog,
      )

      if (result.status === 'approved') {
        result = await submitApproved(maki, [call], result)
      }

      if (result.status === 'confirmed') {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Transfer confirmed on-chain.\nTx: ${result.txHash}\nUserOp: ${result.userOpHash}\n\n${result.summary}`,
            },
          ],
          details: result,
        }
      }

      if (result.status === 'approved') {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Transfer approved.\n${result.error ?? ''}\n\n${result.summary}`.trim(),
            },
          ],
          details: result,
        }
      }

      return {
        content: [{ type: 'text' as const, text: `Transfer blocked: ${result.error}\n\n${result.summary}` }],
        details: result,
      }
    },
  })
}
