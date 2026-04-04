export type SupportedChainId = 8453 | 84532 | 11155111

export type LedgerTransport = 'speculos'

export type LedgerAccountMode = 'eoa-demo'

export interface LedgerConfig {
  transport: LedgerTransport
  derivationPath: string
  speculosHost?: string
  speculosPort?: number
  accountMode?: LedgerAccountMode
}

export interface WorldAgentkitConfig {
  enabled: boolean
  defaultUrl?: string
  allowedOrigins: string[]
  registered: boolean
  registrationTx?: `0x${string}`
}

export interface MakiConfig {
  chainId: SupportedChainId
  rpcUrl: string
  socketPath: string
  policyPath: string
  configPath: string
  dbPath: string
  signerType: 'secure-enclave' | 'ledger' | 'mock' | 'none'
  setupComplete: boolean
  smartAccountAddress?: `0x${string}`
  bundlerApiKey?: string
  uniswapApiKey?: string
  ledger?: LedgerConfig
  /** Ledger-derived EOA address — separate from smartAccountAddress */
  ledgerAddress?: `0x${string}`
  world: WorldAgentkitConfig
}
