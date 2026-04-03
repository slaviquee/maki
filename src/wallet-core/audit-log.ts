import Database from 'better-sqlite3'

export type AuditEventType =
  | 'write_approved'
  | 'write_denied'
  | 'write_submitted'
  | 'write_confirmed'
  | 'write_failed'
  | 'simulation_failed'
  | 'policy_denied'
  | 'user_rejected'
  | 'profile_changed'
  | 'allowlist_changed'
  | 'recurring_created'
  | 'recurring_executed'

export interface AuditEntry {
  id: number
  timestamp: number
  eventType: AuditEventType
  summary: string
  details: string // JSON
}

export interface AuditLog {
  log(eventType: AuditEventType, summary: string, details?: Record<string, unknown>): void
  getRecent(limit?: number): AuditEntry[]
}

export function createAuditLog(dbPath: string): AuditLog {
  const db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}'
    )
  `)

  const insertStmt = db.prepare(
    'INSERT INTO audit_log (timestamp, event_type, summary, details) VALUES (?, ?, ?, ?)',
  )
  const recentStmt = db.prepare(
    'SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?',
  )

  return {
    log(eventType, summary, details = {}) {
      insertStmt.run(Date.now(), eventType, summary, JSON.stringify(details))
    },

    getRecent(limit = 20) {
      const rows = recentStmt.all(limit) as Record<string, unknown>[]
      return rows.map((row) => ({
        id: row['id'] as number,
        timestamp: row['timestamp'] as number,
        eventType: row['event_type'] as AuditEventType,
        summary: row['summary'] as string,
        details: row['details'] as string,
      }))
    },
  }
}
