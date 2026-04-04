import Database from 'better-sqlite3'

export interface SpendingRecord {
  type: 'transfer' | 'swap'
  amountUsdc: number
  timestamp: number
}

export interface SpendingTracker {
  record(type: 'transfer' | 'swap', amountUsdc: number): void
  getDailyTotal(type: 'transfer' | 'swap'): number
  getDailyTotalAll(): { transfer: number; swap: number }
}

export function createSpendingTracker(dbPath: string): SpendingTracker {
  const db = new Database(dbPath)

  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS spending (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `)

  const columns = db.prepare('PRAGMA table_info(spending)').all() as Array<{ name: string }>
  const hasLegacyAmountColumn = columns.some((column) => column.name === 'amount_usd')
  const hasUsdcAmountColumn = columns.some((column) => column.name === 'amount_usdc')

  if (hasLegacyAmountColumn && !hasUsdcAmountColumn) {
    db.exec('ALTER TABLE spending RENAME COLUMN amount_usd TO amount_usdc')
  }

  const insertStmt = db.prepare('INSERT INTO spending (type, amount_usdc, timestamp) VALUES (?, ?, ?)')
  const dailyTotalStmt = db.prepare(
    'SELECT COALESCE(SUM(amount_usdc), 0) as total FROM spending WHERE type = ? AND timestamp > ?',
  )

  function startOfDay(): number {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now.getTime()
  }

  return {
    record(type, amountUsdc) {
      insertStmt.run(type, amountUsdc, Date.now())
    },

    getDailyTotal(type) {
      const row = dailyTotalStmt.get(type, startOfDay()) as { total: number } | undefined
      return row?.total ?? 0
    },

    getDailyTotalAll() {
      return {
        transfer: this.getDailyTotal('transfer'),
        swap: this.getDailyTotal('swap'),
      }
    },
  }
}
