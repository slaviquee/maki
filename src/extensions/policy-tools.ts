import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { defaultPolicy } from '../policy/defaults.js'
import { checkAction } from '../policy/engine.js'
import type { SecurityProfile } from '../policy/types.js'
import type { MakiContext } from './context.js'

/**
 * Requests admin-level approval (action class 3) via the signer daemon.
 * All policy changes are admin actions per the spec.
 */
async function requireAdminApproval(maki: MakiContext, summary: string): Promise<{ approved: boolean; error?: string }> {
  const policy = maki.policy.load()
  const decision = checkAction(policy, 3, { type: 'admin_policy_change' })

  if (!decision.allowed) {
    return { approved: false, error: decision.reason }
  }

  if (decision.approvalMode === 'touch_id') {
    const result = await maki.signer.approveAction({
      summary,
      actionClass: 3,
      details: { type: 'admin_policy_change' },
    })
    if (!result.approved) {
      return { approved: false, error: result.reason ?? 'User rejected policy change' }
    }
  }

  return { approved: true }
}

export function registerPolicyTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  pi.registerTool({
    name: 'set_security_profile',
    label: 'Set Security Profile',
    description:
      'Switch security profile (locked, balanced, relaxed). This is an admin action requiring Touch ID approval.',
    promptSnippet: 'set_security_profile: change security profile (locked/balanced/relaxed)',
    promptGuidelines: [
      'Locked: all writes require Touch ID, automation disabled.',
      'Balanced: most writes require Touch ID, some low-risk auto-approve.',
      'Relaxed: broader auto-approval within policy, high-risk still requires Touch ID.',
      'Always explain what will change before switching.',
      'This is an admin action (class 3) — requires Touch ID.',
    ],
    parameters: Type.Object({
      profile: Type.Union(
        [Type.Literal('locked'), Type.Literal('balanced'), Type.Literal('relaxed')],
        { description: 'Security profile to activate' },
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const profile = params.profile as SecurityProfile

      const current = maki.policy.load()
      const newPolicy = {
        ...defaultPolicy(profile),
        account: current.account,
        allowlists: current.allowlists,
      }

      // Admin approval required before persisting
      const approval = await requireAdminApproval(
        maki,
        `Change security profile from "${current.profile}" to "${profile}"`,
      )
      if (!approval.approved) {
        return {
          content: [{ type: 'text' as const, text: `Profile change denied: ${approval.error}` }],
          details: { denied: true, error: approval.error },
        }
      }

      maki.policy.save(newPolicy)

      const lines = [
        `Security profile changed to: ${profile}`,
        ``,
        `Approval settings:`,
        `  Low risk: ${newPolicy.approval.low_risk}`,
        `  Medium risk: ${newPolicy.approval.medium_risk}`,
        `  High risk: ${newPolicy.approval.high_risk}`,
        `  Admin: ${newPolicy.approval.admin}`,
        ``,
        `Limits:`,
        `  Transfer per-tx: $${newPolicy.limits.transfer_per_tx_usd}`,
        `  Transfer daily: $${newPolicy.limits.transfer_daily_usd}`,
        `  Swap per-tx: $${newPolicy.limits.swap_per_tx_usd}`,
        `  Swap daily: $${newPolicy.limits.swap_daily_usd}`,
        `  Max slippage: ${newPolicy.limits.max_slippage_bps}bps`,
      ]

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: { profile, approval: newPolicy.approval, limits: newPolicy.limits },
      }
    },
  })

  pi.registerTool({
    name: 'get_policy',
    label: 'Get Policy',
    description: 'Show the current security policy: profile, approval settings, limits, allowlists.',
    promptSnippet: 'get_policy: view current security policy settings',
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const policy = maki.policy.load()

      const lines = [
        `Security Profile: ${policy.profile}`,
        ``,
        `Approval:`,
        `  Low risk: ${policy.approval.low_risk}`,
        `  Medium risk: ${policy.approval.medium_risk}`,
        `  High risk: ${policy.approval.high_risk}`,
        `  Admin: ${policy.approval.admin}`,
        `  Timeout: ${policy.approval.timeout_seconds}s`,
        ``,
        `Limits:`,
        `  Transfer per-tx: $${policy.limits.transfer_per_tx_usd}`,
        `  Transfer daily: $${policy.limits.transfer_daily_usd}`,
        `  Swap per-tx: $${policy.limits.swap_per_tx_usd}`,
        `  Swap daily: $${policy.limits.swap_daily_usd}`,
        `  Max slippage: ${policy.limits.max_slippage_bps}bps`,
        `  Max gas: $${policy.limits.max_gas_usd}`,
        ``,
        `Allowlists:`,
        `  Recipients: ${policy.allowlists.recipients.length > 0 ? policy.allowlists.recipients.join(', ') : '(empty)'}`,
        `  Protocols: ${policy.allowlists.protocols.join(', ') || '(empty)'}`,
        `  Tokens: ${policy.allowlists.tokens.join(', ') || '(empty)'}`,
        ``,
        `Dangerous actions:`,
        `  New recipients: ${policy.dangerous_actions.new_recipients}`,
        `  New protocols: ${policy.dangerous_actions.new_protocols}`,
        `  Unlimited approvals: ${policy.dangerous_actions.unlimited_approvals ? 'allowed' : 'forbidden'}`,
      ]

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: policy,
      }
    },
  })

  pi.registerTool({
    name: 'update_allowlist',
    label: 'Update Allowlist',
    description: 'Add or remove entries from token, protocol, or recipient allowlists. Admin action requiring Touch ID.',
    promptSnippet: 'update_allowlist: manage token/protocol/recipient allowlists',
    parameters: Type.Object({
      list: Type.Union(
        [Type.Literal('recipients'), Type.Literal('protocols'), Type.Literal('tokens')],
        { description: 'Which allowlist to update' },
      ),
      action: Type.Union([Type.Literal('add'), Type.Literal('remove')], {
        description: 'Add or remove the entry',
      }),
      value: Type.String({ description: 'Value to add/remove (address, protocol name, or token symbol)' }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()

      const verb = params.action === 'add' ? 'Add' : 'Remove'
      const approval = await requireAdminApproval(
        maki,
        `${verb} "${params.value}" ${params.action === 'add' ? 'to' : 'from'} ${params.list} allowlist`,
      )
      if (!approval.approved) {
        return {
          content: [{ type: 'text' as const, text: `Allowlist change denied: ${approval.error}` }],
          details: { denied: true, error: approval.error },
        }
      }

      const policy = maki.policy.load()
      const list = policy.allowlists[params.list]

      if (params.action === 'add') {
        if (!list.includes(params.value)) {
          list.push(params.value)
        }
      } else {
        const idx = list.indexOf(params.value)
        if (idx >= 0) list.splice(idx, 1)
      }

      maki.policy.save(policy)

      return {
        content: [
          {
            type: 'text' as const,
            text: `${verb === 'Add' ? 'Added' : 'Removed'} "${params.value}" ${params.action === 'add' ? 'to' : 'from'} ${params.list} allowlist.\nCurrent ${params.list}: ${list.join(', ') || '(empty)'}`,
          },
        ],
        details: { list: params.list, action: params.action, value: params.value, current: list },
      }
    },
  })
}
