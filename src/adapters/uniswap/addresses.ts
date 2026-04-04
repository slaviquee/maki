import type { SupportedChainId } from '../../config/types.js'

export interface UniswapAddresses {
  swapRouter: `0x${string}`
  quoterV2: `0x${string}`
  weth: `0x${string}`
}

const BASE_ADDRESSES: UniswapAddresses = {
  swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
  quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
  weth: '0x4200000000000000000000000000000000000006',
}

const BASE_SEPOLIA_ADDRESSES: UniswapAddresses = {
  swapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
  quoterV2: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
  weth: '0x4200000000000000000000000000000000000006',
}

const ADDRESSES: Partial<Record<SupportedChainId, UniswapAddresses>> = {
  8453: BASE_ADDRESSES,
  84532: BASE_SEPOLIA_ADDRESSES,
}

export function getUniswapAddresses(chainId: SupportedChainId): UniswapAddresses {
  const addrs = ADDRESSES[chainId]
  if (!addrs) throw new Error(`Uniswap not available on chain ${chainId}`)
  return addrs
}
