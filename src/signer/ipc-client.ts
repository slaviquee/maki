import { createConnection, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import type {
  IpcRequest,
  IpcResponse,
  SignerClient,
  PingResult,
  StatusResult,
  GetPublicKeyResult,
  GetPublicKeyCoordinatesResult,
  CreateKeyResult,
  SignHashParams,
  SignHashResult,
  ApproveActionParams,
  ApproveActionResult,
  SignerMethod,
} from './types.js'

const DEFAULT_TIMEOUT = 30_000
const SIGN_TIMEOUT = 120_000

export function createSignerIpcClient(socketPath: string): SignerClient {
  let socket: Socket | null = null
  let connectPromise: Promise<void> | null = null
  let buffer = ''
  const pending = new Map<string, { resolve: (v: IpcResponse) => void; reject: (e: Error) => void }>()

  function resetSocket(target: Socket | null = socket) {
    if (target && socket === target) {
      socket = null
    }
  }

  function rejectPending(err: Error) {
    for (const handler of pending.values()) {
      handler.reject(err)
    }
    pending.clear()
  }

  function isReconnectableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false
    }

    const code = 'code' in error ? String(error.code) : ''
    return (
      error.message === 'Signer not connected' ||
      error.message === 'Signer disconnected' ||
      code === 'EPIPE' ||
      code === 'ECONNRESET' ||
      code === 'ENOTCONN' ||
      code === 'ERR_STREAM_DESTROYED'
    )
  }

  function handleData(data: Buffer) {
    buffer += data.toString('utf-8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const response = JSON.parse(line) as IpcResponse
        const handler = pending.get(response.id)
        if (handler) {
          pending.delete(response.id)
          handler.resolve(response)
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  async function ensureConnected(): Promise<void> {
    if (socket && !socket.destroyed) {
      return
    }

    socket = null

    if (connectPromise) {
      return connectPromise
    }

    connectPromise = new Promise<void>((resolve, reject) => {
      const nextSocket = createConnection(socketPath)

      const cleanup = () => {
        nextSocket.off('connect', onConnect)
        nextSocket.off('error', onInitialError)
      }

      const onConnect = () => {
        cleanup()
        socket = nextSocket
        attachSocket(nextSocket)
        connectPromise = null
        resolve()
      }

      const onInitialError = (err: Error) => {
        cleanup()
        resetSocket(nextSocket)
        connectPromise = null
        reject(err)
      }

      nextSocket.once('connect', onConnect)
      nextSocket.once('error', onInitialError)
    })

    return connectPromise
  }

  function attachSocket(nextSocket: Socket) {
    nextSocket.on('data', handleData)
    nextSocket.on('error', (err) => {
      resetSocket(nextSocket)
      rejectPending(err)
    })
    nextSocket.on('close', () => {
      const wasActive = socket === nextSocket
      resetSocket(nextSocket)
      if (wasActive && pending.size > 0) {
        rejectPending(new Error('Signer disconnected'))
      }
    })
  }

  async function sendOnce<T>(method: SignerMethod, params: unknown, timeout = DEFAULT_TIMEOUT): Promise<T> {
    await ensureConnected()

    const activeSocket = socket
    if (!activeSocket) {
      throw new Error('Signer not connected')
    }

    const id = randomUUID()
    const request: IpcRequest = { id, method, params }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Signer request ${method} timed out after ${timeout}ms`))
      }, timeout)

      pending.set(id, {
        resolve: (response: IpcResponse) => {
          clearTimeout(timer)
          if (!response.ok) {
            reject(new Error(response.error?.message ?? `Signer error: ${response.error?.code ?? 'unknown'}`))
          } else {
            resolve(response.result as T)
          }
        },
        reject: (err: Error) => {
          clearTimeout(timer)
          reject(err)
        },
      })

      try {
        activeSocket.write(JSON.stringify(request) + '\n', (err) => {
          if (!err) {
            return
          }
          if (socket === activeSocket) {
            activeSocket.destroy()
            resetSocket(activeSocket)
          }
          pending.delete(id)
          clearTimeout(timer)
          reject(err)
        })
      } catch (error) {
        if (socket === activeSocket) {
          activeSocket.destroy()
          resetSocket(activeSocket)
        }
        pending.delete(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  async function send<T>(method: SignerMethod, params: unknown, timeout = DEFAULT_TIMEOUT, attempt = 0): Promise<T> {
    try {
      return await sendOnce<T>(method, params, timeout)
    } catch (error) {
      if (attempt === 0 && isReconnectableError(error)) {
        resetSocket()
        return send<T>(method, params, timeout, attempt + 1)
      }
      throw error
    }
  }

  return {
    async connect() {
      return ensureConnected()
    },

    disconnect() {
      socket?.destroy()
      socket = null
      connectPromise = null
      for (const handler of pending.values()) {
        handler.reject(new Error('Signer disconnected'))
      }
      pending.clear()
    },

    ping() {
      return send<PingResult>('ping', {})
    },

    status() {
      return send<StatusResult>('status', {})
    },

    getPublicKey() {
      return send<GetPublicKeyResult>('get_public_key', {})
    },

    getPublicKeyCoordinates() {
      return send<GetPublicKeyCoordinatesResult>('get_public_key_coordinates', {})
    },

    createKey() {
      return send<CreateKeyResult>('create_key', {})
    },

    signHash(params: SignHashParams) {
      return send<SignHashResult>('sign_hash', params, SIGN_TIMEOUT)
    },

    approveAction(params: ApproveActionParams) {
      return send<ApproveActionResult>('approve_action', params, SIGN_TIMEOUT)
    },
  }
}
