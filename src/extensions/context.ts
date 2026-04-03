import type { PublicClient } from 'viem'
import type { MakiConfig } from '../config/types.js'
import type { SignerClient } from '../signer/types.js'
import type { PolicyStore } from '../policy/store.js'

export interface MakiContext {
  config: MakiConfig
  signer: SignerClient
  policy: PolicyStore
  chainClient: PublicClient
}
