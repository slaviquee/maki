import { formatUnits, maxUint256, type PublicClient } from 'viem'
import { erc20Abi } from './erc20-abi.js'
import type { TokenInfo } from './types.js'
import type { Allowance } from './types.js'
import type { SupportedChainId } from '../config/types.js'

// Known spender addresses on Base mainnet
const KNOWN_SPENDERS_BASE: Record<string, string> = {
  '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD': 'Uniswap Universal Router',
  '0x2626664c2603336E57B271c5C0b26F421741e481': 'Uniswap Universal Router v2',
}

// Known spender addresses on Base Sepolia
const KNOWN_SPENDERS_BASE_SEPOLIA: Record<string, string> = {}

// Known spender addresses on Ethereum Sepolia
const KNOWN_SPENDERS_ETHEREUM_SEPOLIA: Record<string, string> = {
  '0x02E5be68D46DAc0B524905bfF209cf47EE6dB2a9': 'Uniswap Universal Router',
  '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b': 'Uniswap Universal Router v2',
}

const SPENDER_REGISTRY: Record<SupportedChainId, Record<string, string>> = {
  8453: KNOWN_SPENDERS_BASE,
  84532: KNOWN_SPENDERS_BASE_SEPOLIA,
  11155111: KNOWN_SPENDERS_ETHEREUM_SEPOLIA,
}

export function getKnownSpenders(chainId: SupportedChainId): `0x${string}`[] {
  const spenders = SPENDER_REGISTRY[chainId]
  return spenders ? (Object.keys(spenders) as `0x${string}`[]) : []
}

export async function getAllowances(
  client: PublicClient,
  owner: `0x${string}`,
  tokens: TokenInfo[],
  spenders: `0x${string}`[],
): Promise<Allowance[]> {
  if (tokens.length === 0 || spenders.length === 0) return []

  const calls = tokens.flatMap((token) => spenders.map((spender) => ({ token, spender })))

  const results = await Promise.all(
    calls.map((c) =>
      client
        .readContract({
          address: c.token.address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [owner, c.spender],
        })
        .catch(() => 0n),
    ),
  )

  const chainId = tokens[0]?.chainId
  const spenderLabels = chainId ? (SPENDER_REGISTRY[chainId] ?? {}) : {}

  return calls
    .map((c, i) => {
      const raw = results[i] ?? 0n
      return {
        token: c.token,
        spender: c.spender,
        spenderLabel: spenderLabels[c.spender],
        raw,
        formatted: formatUnits(raw, c.token.decimals),
        isUnlimited: raw >= maxUint256 / 2n,
      }
    })
    .filter((a) => a.raw > 0n)
}
