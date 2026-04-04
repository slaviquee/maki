export type SupportedChainId = 8453 | 84532

export interface MakiConfig {
  chainId: SupportedChainId
  rpcUrl: string
  socketPath: string
  policyPath: string
  configPath: string
  dbPath: string
  signerType: 'secure-enclave' | 'mock' | 'none'
  smartAccountAddress?: `0x${string}`
  bundlerApiKey?: string
}
