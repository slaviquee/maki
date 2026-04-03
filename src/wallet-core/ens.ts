import { createPublicClient, http } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'
import type { EnsResolution } from './types.js'

let ensClient: ReturnType<typeof createPublicClient> | null = null

function getEnsClient() {
  if (!ensClient) {
    ensClient = createPublicClient({
      chain: mainnet,
      transport: http('https://eth.llamarpc.com'),
    })
  }
  return ensClient
}

export async function resolveEns(name: string): Promise<EnsResolution> {
  try {
    const client = getEnsClient()
    const normalized = normalize(name)
    const address = await client.getEnsAddress({ name: normalized })

    let avatar: string | undefined
    try {
      const result = await client.getEnsAvatar({ name: normalized })
      avatar = result ?? undefined
    } catch {
      // avatar is optional
    }

    return { name: normalized, address, avatar }
  } catch (error) {
    return {
      name,
      address: null,
      error: error instanceof Error ? error.message : 'Unknown ENS error',
    }
  }
}

export async function reverseResolveEns(address: `0x${string}`): Promise<string | null> {
  try {
    const client = getEnsClient()
    return await client.getEnsName({ address })
  } catch {
    return null
  }
}
