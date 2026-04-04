import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { RecurringAction, RecurringStatus } from './types.js'

export interface RecurringActionStore {
  create(action: Omit<RecurringAction, 'id' | 'createdAt' | 'runCount'>): RecurringAction
  get(id: string): RecurringAction | null
  list(): RecurringAction[]
  listActive(): RecurringAction[]
  update(
    id: string,
    updates: Partial<Pick<RecurringAction, 'status' | 'nextRunAt' | 'lastRunAt' | 'lastError' | 'runCount'>>,
  ): void
  delete(id: string): void
}

export function createRecurringActionStore(dbPath: string): RecurringActionStore {
  const db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_actions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      params TEXT NOT NULL,
      interval_ms INTEGER NOT NULL,
      next_run_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_run_at INTEGER,
      last_error TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      max_runs INTEGER,
      created_at INTEGER NOT NULL
    )
  `)

  const insertStmt = db.prepare(`
    INSERT INTO recurring_actions (id, type, status, params, interval_ms, next_run_at, expires_at, last_run_at, last_error, run_count, max_runs, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const getStmt = db.prepare('SELECT * FROM recurring_actions WHERE id = ?')
  const listStmt = db.prepare('SELECT * FROM recurring_actions ORDER BY created_at DESC')
  const listActiveStmt = db.prepare("SELECT * FROM recurring_actions WHERE status = 'active' ORDER BY next_run_at ASC")
  const updateStmt = db.prepare(
    'UPDATE recurring_actions SET status = ?, next_run_at = ?, last_run_at = ?, last_error = ?, run_count = ? WHERE id = ?',
  )
  const deleteStmt = db.prepare('DELETE FROM recurring_actions WHERE id = ?')

  function rowToAction(row: Record<string, unknown>): RecurringAction {
    return {
      id: row['id'] as string,
      type: row['type'] as RecurringAction['type'],
      status: row['status'] as RecurringStatus,
      params: JSON.parse(row['params'] as string),
      intervalMs: row['interval_ms'] as number,
      nextRunAt: row['next_run_at'] as number,
      expiresAt: row['expires_at'] as number,
      lastRunAt: row['last_run_at'] as number | undefined,
      lastError: row['last_error'] as string | undefined,
      runCount: row['run_count'] as number,
      maxRuns: row['max_runs'] as number | undefined,
      createdAt: row['created_at'] as number,
    }
  }

  return {
    create(action) {
      const id = randomUUID()
      const now = Date.now()
      insertStmt.run(
        id,
        action.type,
        action.status,
        JSON.stringify(action.params),
        action.intervalMs,
        action.nextRunAt,
        action.expiresAt,
        action.lastRunAt ?? null,
        action.lastError ?? null,
        0,
        action.maxRuns ?? null,
        now,
      )
      return { ...action, id, createdAt: now, runCount: 0 }
    },

    get(id) {
      const row = getStmt.get(id) as Record<string, unknown> | undefined
      return row ? rowToAction(row) : null
    },

    list() {
      const rows = listStmt.all() as Record<string, unknown>[]
      return rows.map(rowToAction)
    },

    listActive() {
      const rows = listActiveStmt.all() as Record<string, unknown>[]
      return rows.map(rowToAction)
    },

    update(id, updates) {
      const current = this.get(id)
      if (!current) return
      updateStmt.run(
        updates.status ?? current.status,
        updates.nextRunAt ?? current.nextRunAt,
        updates.lastRunAt ?? current.lastRunAt ?? null,
        updates.lastError ?? current.lastError ?? null,
        updates.runCount ?? current.runCount,
        id,
      )
    },

    delete(id) {
      deleteStmt.run(id)
    },
  }
}
