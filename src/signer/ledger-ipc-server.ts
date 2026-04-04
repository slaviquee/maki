/**
 * Ledger signer IPC server — TypeScript/Node process that speaks the same
 * Unix domain socket protocol as the Swift signer daemon.
 *
 * `maki signer start` dispatches here when the configured backend is 'ledger'.
 */

import { createServer, type Server, type Socket } from 'node:net'
import { unlinkSync, existsSync } from 'node:fs'
import type { IpcRequest, IpcResponse, SignerMethod } from './types.js'
import { createLedgerSigner, type LedgerSignerConfig } from './ledger-signer.js'

const VERSION = '0.1.0-ledger'

export interface LedgerIpcServerConfig {
  socketPath: string
  ledger: LedgerSignerConfig
}

export async function startLedgerIpcServer(config: LedgerIpcServerConfig): Promise<{ stop(): Promise<void> }> {
  const ledger = await createLedgerSigner(config.ledger)
  let cachedAddress: `0x${string}` | undefined
  let cachedPublicKey: string | undefined

  // Pre-connect and cache the address
  try {
    await ledger.connect()
    const addrResult = await ledger.getAddress()
    cachedAddress = addrResult.address
    cachedPublicKey = addrResult.publicKey
    console.warn(`Ledger signer ready — address: ${cachedAddress}`)
    console.warn(`Transport: ${config.ledger.transport}, path: ${config.ledger.derivationPath}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Warning: Ledger pre-connect failed: ${msg}`)
    console.error('The signer will attempt to connect on first request.')
  }

  async function handleMethod(method: SignerMethod, params: unknown): Promise<unknown> {
    switch (method) {
      case 'ping':
        return { pong: true, version: VERSION }

      case 'status': {
        const connected = ledger.isConnected()
        const ethApp = connected ? await ledger.isEthereumAppOpen() : false
        return {
          ready: connected && ethApp,
          signerType: 'ledger' as const,
          hasKey: cachedAddress !== undefined,
          publicKey: cachedPublicKey,
          keyStorage: 'persistent' as const,
          transport: config.ledger.transport,
          deviceConnected: connected,
          ethereumAppOpen: ethApp,
          address: cachedAddress,
        }
      }

      case 'get_public_key': {
        if (cachedPublicKey && cachedAddress) {
          return { publicKey: cachedPublicKey, address: cachedAddress }
        }
        const result = await ledger.getAddress()
        cachedAddress = result.address
        cachedPublicKey = result.publicKey
        return { publicKey: result.publicKey, address: result.address }
      }

      case 'get_address': {
        if (cachedAddress && cachedPublicKey) {
          return { address: cachedAddress, publicKey: cachedPublicKey }
        }
        const result = await ledger.getAddress()
        cachedAddress = result.address
        cachedPublicKey = result.publicKey
        return result
      }

      case 'get_public_key_coordinates':
        // Not applicable for secp256k1/Ledger — return zero coordinates
        // The caller should check signerType and use get_address instead
        return {
          x: '0x0000000000000000000000000000000000000000000000000000000000000000' as const,
          y: '0x0000000000000000000000000000000000000000000000000000000000000000' as const,
        }

      case 'create_key': {
        // Ledger keys are hardware-derived, not created. Return the existing key.
        const addr = await ledger.getAddress()
        cachedAddress = addr.address
        cachedPublicKey = addr.publicKey
        return {
          publicKey: addr.publicKey,
          x: '0x0000000000000000000000000000000000000000000000000000000000000000',
          y: '0x0000000000000000000000000000000000000000000000000000000000000000',
          created: false,
          keyStorage: 'persistent',
        }
      }

      case 'sign_transaction': {
        const p = params as { serializedTransaction: string; actionSummary: string }
        console.warn(`Ledger signTransaction: ${p.actionSummary}`)
        console.warn('Confirm on your Ledger device...')
        try {
          // Convert hex string to Uint8Array
          const hex = p.serializedTransaction.startsWith('0x')
            ? p.serializedTransaction.slice(2)
            : p.serializedTransaction
          const bytes = new Uint8Array(hex.length / 2)
          for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
          }
          const sig = await ledger.signTransaction(bytes)
          const signature = `0x${sig.r.slice(2)}${sig.s.slice(2)}${sig.v.toString(16).padStart(2, '0')}` as const
          return { signature, r: sig.r, s: sig.s, v: sig.v, approved: true }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
            return { signature: '0x', r: '0x', s: '0x', v: 0, approved: false }
          }
          throw err
        }
      }

      case 'sign_hash':
        throw new Error(
          'Raw hash signing is not supported on the Ledger backend. ' +
            'Use structured signing methods instead of personal_sign over a digest.',
        )

      case 'sign_personal_message': {
        const p = params as { message: string; actionSummary: string }
        console.warn(`Ledger personal_sign: ${p.actionSummary}`)
        console.warn('Confirm on your Ledger device...')
        try {
          const sig = await ledger.signPersonalMessage(p.message)
          const signature = `0x${sig.r.slice(2)}${sig.s.slice(2)}${sig.v.toString(16).padStart(2, '0')}` as const
          return { signature, r: sig.r, s: sig.s, v: sig.v, approved: true }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
            return { signature: '0x', r: '0x', s: '0x', v: 0, approved: false }
          }
          throw err
        }
      }

      case 'sign_typed_data': {
        const p = params as { typedData: unknown; actionSummary: string }
        console.warn(`Ledger signTypedData: ${p.actionSummary}`)
        console.warn('Confirm on your Ledger device...')
        try {
          const sig = await ledger.signTypedData(p.typedData)
          const signature = `0x${sig.r.slice(2)}${sig.s.slice(2)}${sig.v.toString(16).padStart(2, '0')}` as const
          return { signature, r: sig.r, s: sig.s, v: sig.v, approved: true }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
            return { signature: '0x', r: '0x', s: '0x', v: 0, approved: false }
          }
          throw err
        }
      }

      case 'approve_action':
        // For Ledger, approval happens on-device during signing.
        // Pre-approval always returns true — the real gate is the device confirm.
        return { approved: true }

      default:
        throw new Error(`Unknown method: ${method}`)
    }
  }

  function handleConnection(socket: Socket) {
    let buffer = ''

    socket.on('data', (data: Buffer) => {
      buffer += data.toString('utf-8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        void processLine(line, socket)
      }
    })

    socket.on('error', () => {
      // Client disconnected — ignore
    })
  }

  async function processLine(line: string, socket: Socket) {
    let request: IpcRequest
    try {
      request = JSON.parse(line) as IpcRequest
    } catch {
      return // Skip malformed
    }

    let response: IpcResponse
    try {
      const result = await handleMethod(request.method, request.params)
      response = { id: request.id, ok: true, result }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      response = { id: request.id, ok: false, error: { code: 'LEDGER_ERROR', message } }
    }

    try {
      socket.write(JSON.stringify(response) + '\n')
    } catch {
      // Socket closed
    }
  }

  // Clean up stale socket file
  if (existsSync(config.socketPath)) {
    unlinkSync(config.socketPath)
  }

  const server: Server = createServer(handleConnection)

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject)
    server.listen(config.socketPath, () => {
      console.warn(`Ledger signer IPC listening on ${config.socketPath}`)
      resolve()
    })
  })

  // Handle shutdown signals
  const shutdown = async () => {
    console.warn('\nShutting down Ledger signer...')
    server.close()
    await ledger.disconnect()
    if (existsSync(config.socketPath)) {
      unlinkSync(config.socketPath)
    }
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())

  return {
    async stop() {
      server.close()
      await ledger.disconnect()
      if (existsSync(config.socketPath)) {
        unlinkSync(config.socketPath)
      }
    },
  }
}
