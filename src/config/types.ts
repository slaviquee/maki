export type SupportedChainId = 8453 | 84532 | 11155111

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
  signerType: 'secure-enclave' | 'mock' | 'none'
  setupComplete: boolean
  smartAccountAddress?: `0x${string}`
  bundlerApiKey?: string
  uniswapApiKey?: string
  world: WorldAgentkitConfig
}
