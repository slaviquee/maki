import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { createRecurringActionStore } from '../scheduler/store.js'
import type { RecurringAction } from '../scheduler/types.js'
import { findToken } from '../wallet-core/tokens.js'
import { resolveEns } from '../wallet-core/ens.js'
import { checkAction } from '../policy/engine.js'
import { paths } from '../config/paths.js'
import type { MakiContext } from './context.js'

function formatAction(a: RecurringAction): string {
  const nextRun = new Date(a.nextRunAt).toLocaleString()
  const expires = new Date(a.expiresAt).toLocaleString()
  const params = a.params
  const desc =
    params.type === 'transfer'
      ? `Transfer ${params.amount} ${params.token} to ${params.to}`
      : `Swap ${params.amountIn} ${params.tokenIn} → ${params.tokenOut}`

  return [
    `[${a.id.slice(0, 8)}] ${desc}`,
    `  Status: ${a.status} | Runs: ${a.runCount}${a.maxRuns ? `/${a.maxRuns}` : ''} | Next: ${nextRun}`,
    `  Expires: ${expires}${a.lastError ? ` | Last error: ${a.lastError}` : ''}`,
  ].join('\n')
}

export function registerRecurringTools(pi: ExtensionAPI, getCtx: () => MakiContext) {
  const store = createRecurringActionStore(paths.db)

  pi.registerTool({
    name: 'create_recurring_transfer',
    label: 'Create Recurring Transfer',
    description: 'Set up a recurring token transfer. Must fit within policy limits. Requires automation to be enabled.',
    promptSnippet: 'create_recurring_transfer: schedule a repeating transfer',
    parameters: Type.Object({
      token: Type.String({ description: 'Token symbol (e.g. "USDC", "ETH")' }),
      to: Type.String({ description: 'Recipient address or ENS name' }),
      amount: Type.String({ description: 'Amount per transfer' }),
      intervalHours: Type.Number({ description: 'Hours between transfers' }),
      maxRuns: Type.Optional(Type.Number({ description: 'Max number of executions' })),
      expiresInDays: Type.Optional(Type.Number({ description: 'Expires after N days (default: 30)' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const maki = getCtx()
      const policy = maki.policy.load()

      if (!policy.automation.enabled) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Automation is disabled in current policy. Enable it with update_policy or switch to a profile that allows automation.',
            },
          ],
          details: { error: 'automation_disabled' },
        }
      }

      // Validate token against registry
      const tokenInfo = findToken(maki.config.chainId, params.token)
      if (!tokenInfo && params.token !== 'ETH') {
        return {
          content: [{ type: 'text' as const, text: `Token "${params.token}" not found in verified registry.` }],
          details: { error: 'token_not_found' },
        }
      }

      // Resolve recipient ENS deterministically at creation time
      let resolvedTo = params.to
      if (params.to.endsWith('.eth')) {
        const resolved = await resolveEns(params.to)
        if (!resolved.address) {
          return {
            content: [{ type: 'text' as const, text: `Could not resolve ENS name "${params.to}".` }],
            details: { error: 'ens_failed' },
          }
        }
        resolvedTo = resolved.address
      }

      // Policy check at creation time
      const policyCheck = checkAction(policy, 1, {
        type: 'transfer',
        recipient: resolvedTo,
        token: params.token,
      })
      if (!policyCheck.allowed) {
        return {
          content: [{ type: 'text' as const, text: `Recurring transfer denied by policy: ${policyCheck.reason}` }],
          details: { error: 'policy_denied', reason: policyCheck.reason },
        }
      }

      const now = Date.now()
      const intervalMs = params.intervalHours * 60 * 60 * 1000
      const expiresAt = now + (params.expiresInDays ?? 30) * 24 * 60 * 60 * 1000

      const action = store.create({
        type: 'transfer',
        status: 'active',
        params: {
          type: 'transfer',
          token: params.token,
          to: resolvedTo, // store resolved address, not raw ENS
          amount: params.amount,
        },
        intervalMs,
        nextRunAt: now + intervalMs,
        expiresAt,
        maxRuns: params.maxRuns,
      })

      maki.auditLog.log('recurring_created', `Recurring transfer: ${params.amount} ${params.token} to ${resolvedTo}`, {
        actionId: action.id,
      })

      return {
        content: [{ type: 'text' as const, text: `Recurring transfer created:\n${formatAction(action)}` }],
        details: action,
      }
    },
  })

  pi.registerTool({
    name: 'list_recurring_actions',
    label: 'List Recurring Actions',
    description: 'List all recurring actions (transfers and swaps).',
    promptSnippet: 'list_recurring_actions: show all scheduled recurring actions',
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const actions = store.list()

      if (actions.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No recurring actions configured.' }],
          details: { actions: [] },
        }
      }

      const text = actions.map(formatAction).join('\n\n')
      return {
        content: [{ type: 'text' as const, text }],
        details: { actions },
      }
    },
  })

  pi.registerTool({
    name: 'manage_recurring_action',
    label: 'Manage Recurring Action',
    description: 'Pause, resume, or delete a recurring action by ID.',
    promptSnippet: 'manage_recurring_action: pause/resume/delete a scheduled action',
    parameters: Type.Object({
      id: Type.String({ description: 'Action ID (first 8 chars is enough)' }),
      action: Type.Union([Type.Literal('pause'), Type.Literal('resume'), Type.Literal('delete')]),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      // Find by prefix match
      const all = store.list()
      const match = all.find((a) => a.id.startsWith(params.id))
      if (!match) {
        return {
          content: [{ type: 'text' as const, text: `No recurring action found with ID starting with "${params.id}"` }],
          details: { error: 'not_found' },
        }
      }

      if (params.action === 'delete') {
        store.delete(match.id)
        return {
          content: [{ type: 'text' as const, text: `Deleted recurring action ${match.id.slice(0, 8)}` }],
          details: { deleted: match.id },
        }
      }

      const newStatus = params.action === 'pause' ? 'paused' : 'active'
      store.update(match.id, { status: newStatus as 'active' | 'paused' })

      return {
        content: [{ type: 'text' as const, text: `Recurring action ${match.id.slice(0, 8)} is now ${newStatus}` }],
        details: { id: match.id, status: newStatus },
      }
    },
  })
}
