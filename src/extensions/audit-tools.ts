import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { createAuditLog } from '../wallet-core/audit-log.js'
import { paths } from '../config/paths.js'

export function registerAuditTools(pi: ExtensionAPI) {
  const auditLog = createAuditLog(paths.db)

  pi.registerTool({
    name: 'get_audit_log',
    label: 'Get Audit Log',
    description: 'View recent wallet actions and security events from the local audit log.',
    promptSnippet: 'get_audit_log: view recent wallet activity',
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: 'Number of entries to show (default: 20)' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const entries = auditLog.getRecent(params.limit ?? 20)

      if (entries.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No audit log entries yet.' }],
          details: { entries: [] },
        }
      }

      const lines = entries.map((e) => {
        const time = new Date(e.timestamp).toLocaleString()
        return `[${time}] ${e.eventType}: ${e.summary}`
      })

      return {
        content: [{ type: 'text' as const, text: `Recent activity:\n${lines.join('\n')}` }],
        details: { entries },
      }
    },
  })
}
