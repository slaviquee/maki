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
  let buffer = ''
  const pending = new Map<string, { resolve: (v: IpcResponse) => void; reject: (e: Error) => void }>()

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

  async function send<T>(method: SignerMethod, params: unknown, timeout = DEFAULT_TIMEOUT): Promise<T> {
    if (!socket) {
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

      socket!.write(JSON.stringify(request) + '\n')
    })
  }

  return {
    async connect() {
      return new Promise<void>((resolve, reject) => {
        socket = createConnection(socketPath, () => resolve())
        socket.on('data', handleData)
        socket.on('error', (err) => {
          for (const handler of pending.values()) {
            handler.reject(err)
          }
          pending.clear()
          reject(err)
        })
        socket.on('close', () => {
          socket = null
        })
      })
    },

    disconnect() {
      socket?.destroy()
      socket = null
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
