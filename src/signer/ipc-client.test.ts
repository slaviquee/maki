import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { join } from 'node:path'
import { createSignerIpcClient } from './ipc-client.js'

interface MockSignerServer {
  close(): Promise<void>
}

function createMockSignerServer(socketPath: string, version: string): Promise<MockSignerServer> {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    let buffer = ''

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        const request = JSON.parse(line) as { id: string; method: string }

        if (request.method === 'ping') {
          socket.write(
            JSON.stringify({
              id: request.id,
              ok: true,
              result: { pong: true, version },
            }) + '\n',
          )
        }
      }
    })

    socket.on('close', () => {
      sockets.delete(socket)
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      server.off('error', reject)
      resolve({
        async close() {
          for (const socket of sockets) {
            socket.destroy()
          }
          await closeServer(server)
        },
      })
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

describe('createSignerIpcClient', () => {
  let tempDir: string | null = null
  let mockServer: MockSignerServer | null = null

  afterEach(async () => {
    if (mockServer) {
      await mockServer.close()
      mockServer = null
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it('reconnects after the signer daemon restarts', async () => {
    const rootTempDir = join(process.cwd(), '.tmp-vitest')
    mkdirSync(rootTempDir, { recursive: true })
    tempDir = mkdtempSync(join(rootTempDir, 'maki-ipc-client-'))
    const socketPath = join(tempDir, 'signer.sock')

    mockServer = await createMockSignerServer(socketPath, 'v1')

    const client = createSignerIpcClient(socketPath)
    await client.connect()
    await expect(client.ping()).resolves.toEqual({ pong: true, version: 'v1' })

    await mockServer.close()
    mockServer = await createMockSignerServer(socketPath, 'v2')

    await expect(client.ping()).resolves.toEqual({ pong: true, version: 'v2' })

    client.disconnect()
  })
})
