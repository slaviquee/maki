/**
 * Ledger signer backend using the official Device Management Kit (DMK)
 * and Ethereum Signer Kit over the Speculos HTTP transport.
 *
 * Wraps the observable-based DMK API into a promise-based interface
 * compatible with the Maki signer IPC protocol.
 */

import { createRequire } from 'node:module'
import type { LedgerTransport } from '../config/types.js'

// ---------------------------------------------------------------------------
// DMK types — declared structurally so this module compiles even if the
// Ledger packages aren't installed yet (they're optional/peer deps).
// At runtime the actual classes come from dynamic imports.
// ---------------------------------------------------------------------------

interface DmkInstance {
  startDiscovering(opts: Record<string, never>): { subscribe: (obs: DiscoveryObserver) => { unsubscribe(): void } }
  connect(opts: { device: unknown }): Promise<string>
  disconnect(opts: { sessionId: string }): Promise<void>
  getConnectedDevice(opts: { sessionId: string }): { name: string; modelId: string }
  getDeviceSessionState(opts: { sessionId: string }): {
    subscribe: (obs: { next(s: DeviceSessionState): void; error?(e: unknown): void }) => { unsubscribe(): void }
  }
}

interface DeviceSessionState {
  deviceStatus: string
  currentApp?: { name: string; version: string }
}

interface DiscoveryObserver {
  next(device: unknown): void
  error?(err: unknown): void
  complete?(): void
}

interface SignerEthInstance {
  getAddress(
    derivationPath: string,
    options?: { checkOnDevice?: boolean },
  ): DeviceAction<{ publicKey: string; address: `0x${string}` }>
  signMessage(derivationPath: string, message: string): DeviceAction<EcdsaSignature>
  signTypedData(derivationPath: string, typedData: unknown): DeviceAction<EcdsaSignature>
  signTransaction(
    derivationPath: string,
    transaction: Uint8Array,
    options?: { domain?: string },
  ): DeviceAction<EcdsaSignature>
}

interface EcdsaSignature {
  r: `0x${string}`
  s: `0x${string}`
  v: number
}

interface DeviceAction<T> {
  observable: {
    subscribe: (obs: { next(state: DeviceActionState<T>): void; error?(err: unknown): void; complete?(): void }) => {
      unsubscribe(): void
    }
  }
  cancel: () => void
}

interface DeviceActionState<T> {
  status: string
  output?: T
  error?: unknown
}

// ---------------------------------------------------------------------------
// Ledger signer config and instance
// ---------------------------------------------------------------------------

export interface LedgerSignerConfig {
  transport: LedgerTransport
  derivationPath: string
  speculosHost?: string
  speculosPort?: number
}

export interface LedgerSigner {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  getAddress(): Promise<{ address: `0x${string}`; publicKey: string }>
  signPersonalMessage(message: string): Promise<EcdsaSignature>
  signTypedData(typedData: unknown): Promise<EcdsaSignature>
  signTransaction(serializedTx: Uint8Array): Promise<EcdsaSignature>
  getTransport(): LedgerTransport
  getDerivationPath(): string
  isEthereumAppOpen(): Promise<boolean>
}

/**
 * Resolves a DeviceAction observable to a promise.
 * Watches for the 'completed' status with output, or errors.
 */
function resolveDeviceAction<T>(action: DeviceAction<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const sub = action.observable.subscribe({
      next(state: DeviceActionState<T>) {
        if (state.status === 'completed' && state.output !== undefined) {
          sub.unsubscribe()
          resolve(state.output)
        } else if (state.status === 'error') {
          sub.unsubscribe()
          reject(new Error(state.error ? String(state.error) : 'Device action failed'))
        }
      },
      error(err: unknown) {
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    })
  })
}

export async function createLedgerSigner(config: LedgerSignerConfig): Promise<LedgerSigner> {
  // Ledger's published ESM bundle currently re-exports a directory path that Node
  // refuses to resolve. Load the CommonJS build via createRequire() instead.
  const require = createRequire(import.meta.url)

  // Runtime types come from the packages; we keep structural TS types above so
  // this module can still compile cleanly in environments without Ledger deps.
  const dmkModule = require('@ledgerhq/device-management-kit') as Record<string, unknown>
  const DeviceManagementKitBuilder = dmkModule['DeviceManagementKitBuilder'] as new () => Record<string, unknown>
  const ConsoleLogger = dmkModule['ConsoleLogger'] as new () => unknown

  // Build DMK with the Speculos HTTP transport.
  const builder = new DeviceManagementKitBuilder() as unknown as Record<
    string,
    (arg: unknown) => Record<string, unknown>
  >
  const withLogger = builder['addLogger']!(new ConsoleLogger())

  const mod = require('@ledgerhq/device-transport-kit-speculos') as Record<string, unknown>
  const speculosTransportFactory = mod['speculosTransportFactory'] as undefined | ((url?: string) => unknown)
  const host = config.speculosHost ?? '127.0.0.1'
  const port = config.speculosPort ?? 5000
  const speculosUrl = `http://${host}:${port}`
  const transportFactory = speculosTransportFactory ? speculosTransportFactory(speculosUrl) : undefined

  if (!transportFactory) {
    throw new Error(`Failed to initialize Ledger transport for ${config.transport}`)
  }

  const withTransport = (withLogger['addTransport'] as (f: unknown) => Record<string, unknown>)(transportFactory)
  const dmk = (withTransport['build'] as () => DmkInstance)()

  let sessionId: string | undefined
  let ethSigner: SignerEthInstance | undefined

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId

    // Discover first available device
    const device = await new Promise<unknown>((resolve, reject) => {
      let settled = false
      let sub: { unsubscribe(): void } | undefined

      const timeout = setTimeout(() => {
        settled = true
        sub?.unsubscribe()
        reject(
          new Error(
            `No Speculos Ledger session found within 30 seconds. Ensure Speculos is running at ${speculosUrl} and the Ethereum app is open.`,
          ),
        )
      }, 30_000)

      sub = dmk.startDiscovering({}).subscribe({
        next(discovered: unknown) {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          queueMicrotask(() => sub?.unsubscribe())
          resolve(discovered)
        },
        error(err: unknown) {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          sub?.unsubscribe()
          reject(err instanceof Error ? err : new Error(String(err)))
        },
      })
    })

    sessionId = await dmk.connect({ device })
    return sessionId
  }

  async function ensureEthSigner(): Promise<SignerEthInstance> {
    if (ethSigner) return ethSigner

    const sid = await ensureSession()

    const ethModule = require('@ledgerhq/device-signer-kit-ethereum') as Record<string, unknown>
    const SignerEthBuilder = ethModule['SignerEthBuilder'] as new (opts: Record<string, unknown>) => {
      build(): SignerEthInstance
    }

    ethSigner = new SignerEthBuilder({ dmk, sessionId: sid }).build()
    return ethSigner
  }

  return {
    async connect() {
      await ensureSession()
    },

    async disconnect() {
      if (sessionId) {
        try {
          await dmk.disconnect({ sessionId })
        } catch {
          // Best effort cleanup
        }
        sessionId = undefined
        ethSigner = undefined
      }
    },

    isConnected() {
      return sessionId !== undefined
    },

    async getAddress() {
      const signer = await ensureEthSigner()
      const action = signer.getAddress(config.derivationPath, { checkOnDevice: false })
      const result = await resolveDeviceAction(action)
      return { address: result.address, publicKey: result.publicKey }
    },

    async signPersonalMessage(message: string) {
      const signer = await ensureEthSigner()
      const action = signer.signMessage(config.derivationPath, message)
      return resolveDeviceAction(action)
    },

    async signTypedData(typedData: unknown) {
      const signer = await ensureEthSigner()
      const action = signer.signTypedData(config.derivationPath, typedData)
      return resolveDeviceAction(action)
    },

    async signTransaction(serializedTx: Uint8Array) {
      const signer = await ensureEthSigner()
      const action = signer.signTransaction(config.derivationPath, serializedTx)
      return resolveDeviceAction(action)
    },

    getTransport() {
      return config.transport
    },

    getDerivationPath() {
      return config.derivationPath
    },

    async isEthereumAppOpen() {
      if (!sessionId) return false

      return new Promise<boolean>((resolve) => {
        let settled = false
        let sub: { unsubscribe(): void } | undefined

        sub = dmk.getDeviceSessionState({ sessionId: sessionId! }).subscribe({
          next(state: DeviceSessionState) {
            if (settled) return
            settled = true
            queueMicrotask(() => sub?.unsubscribe())
            resolve(state.currentApp?.name === 'Ethereum')
          },
          error() {
            if (settled) return
            settled = true
            sub?.unsubscribe()
            resolve(false)
          },
        })

        // Timeout after 5s
        setTimeout(() => {
          if (settled) return
          settled = true
          sub?.unsubscribe()
          resolve(false)
        }, 5_000)
      })
    },
  }
}
