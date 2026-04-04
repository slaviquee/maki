import { startLedgerIpcServer, type LedgerIpcServerConfig } from './ledger-ipc-server.js'

async function main() {
  const socketPath = process.argv[2]
  const rawConfig = process.argv[3]

  if (!socketPath || !rawConfig) {
    throw new Error('Usage: node --import tsx src/signer/ledger-server-main.ts <socketPath> <ledgerConfigJson>')
  }

  const ledger = JSON.parse(rawConfig) as LedgerIpcServerConfig['ledger']

  await startLedgerIpcServer({
    socketPath,
    ledger,
  })

  await new Promise<void>(() => {})
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(message)
  process.exit(1)
})
