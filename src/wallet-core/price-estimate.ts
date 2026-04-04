import { type PublicClient, parseUnits, formatUnits } from 'viem'
import { quoterV2Abi } from '../adapters/uniswap/abis.js'
import { getUniswapAddresses } from '../adapters/uniswap/addresses.js'
import type { SupportedChainId } from '../config/types.js'

const STABLECOIN_SYMBOLS = new Set(['USDC', 'DAI', 'USDT'])

// USDC address on Base mainnet for ETH/USDC price quotes
const USDC_ADDRESS: Record<SupportedChainId, `0x${string}`> = {
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
}

const USDC_DECIMALS = 6

/**
 * Estimates the USD value of a token amount.
 *
 * - Stablecoins: 1:1 assumption (no RPC call needed)
 * - ETH: on-chain quote via Uniswap ETH/USDC pool
 * - Other tokens: attempts Uniswap quote against USDC
 *
 * Returns undefined only if quoting fails (no liquidity, RPC error).
 * Never uses model output — all prices come from on-chain reads.
 */
export async function estimateUsdValue(
  client: PublicClient,
  chainId: SupportedChainId,
  tokenSymbol: string,
  tokenAddress: `0x${string}` | undefined,
  amount: string,
): Promise<number | undefined> {
  // Stablecoins: 1:1
  if (STABLECOIN_SYMBOLS.has(tokenSymbol.toUpperCase())) {
    return parseFloat(amount)
  }

  // For ETH and other tokens, quote against USDC via Uniswap
  const addresses = getUniswapAddresses(chainId)
  const usdcAddress = USDC_ADDRESS[chainId]
  if (!addresses || !usdcAddress) return undefined

  // Determine the token address for quoting
  const inputAddress = tokenSymbol === 'ETH' ? addresses.weth : tokenAddress
  if (!inputAddress) return undefined

  // Use a small reference amount (0.01 ETH / 1 token) to get a price,
  // then scale to the actual amount
  const decimals = tokenSymbol === 'ETH' ? 18 : 18 // default to 18 for unknown
  const amountIn = parseUnits(amount, decimals)

  if (amountIn === 0n) return 0

  try {
    const result = await client.simulateContract({
      address: addresses.quoterV2,
      abi: quoterV2Abi,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          tokenIn: inputAddress,
          tokenOut: usdcAddress,
          amountIn,
          fee: 500, // 0.05% tier (most liquid for major pairs)
          sqrtPriceLimitX96: 0n,
        },
      ],
    })

    const [amountOutRaw] = result.result
    return parseFloat(formatUnits(amountOutRaw, USDC_DECIMALS))
  } catch {
    // Try 0.3% fee tier as fallback
    try {
      const result = await client.simulateContract({
        address: addresses.quoterV2,
        abi: quoterV2Abi,
        functionName: 'quoteExactInputSingle',
        args: [
          {
            tokenIn: inputAddress,
            tokenOut: usdcAddress,
            amountIn,
            fee: 3000,
            sqrtPriceLimitX96: 0n,
          },
        ],
      })

      const [amountOutRaw] = result.result
      return parseFloat(formatUnits(amountOutRaw, USDC_DECIMALS))
    } catch {
      return undefined
    }
  }
}
