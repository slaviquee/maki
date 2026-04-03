import { formatEther, formatUnits, type PublicClient } from 'viem'
import { erc20Abi } from './erc20-abi.js'
import { getTokenRegistry } from './tokens.js'
import type { SupportedChainId } from '../config/types.js'
import type { TokenBalance, WalletBalances } from './types.js'

export async function getBalances(
  client: PublicClient,
  address: `0x${string}`,
  chainId: SupportedChainId,
): Promise<WalletBalances> {
  const tokens = getTokenRegistry(chainId)

  const ethBalancePromise = client.getBalance({ address })

  const tokenBalancePromises = tokens.map((token) =>
    client
      .readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      })
      .catch(() => 0n),
  )

  const [ethBalance, ...tokenResults] = await Promise.all([ethBalancePromise, ...tokenBalancePromises])

  const tokenBalances: TokenBalance[] = tokens
    .map((token, i) => ({
      token,
      raw: tokenResults[i] ?? 0n,
      formatted: formatUnits(tokenResults[i] ?? 0n, token.decimals),
    }))
    .filter((b) => b.raw > 0n)

  return {
    address,
    chainId,
    eth: { raw: ethBalance, formatted: formatEther(ethBalance) },
    tokens: tokenBalances,
    timestamp: Date.now(),
  }
}
