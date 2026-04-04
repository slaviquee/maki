/**
 * Best-effort USD price estimation for spending limit enforcement.
 *
 * Stablecoins use 1:1 USD assumption. ETH and other tokens return
 * undefined (no price feed in v1). When undefined, spending limits
 * based on USD are not enforced for that action — the policy engine
 * only checks amountUsd when it's populated.
 *
 * A proper price feed (e.g. Chainlink) is planned for Stage 6.
 */

const STABLECOIN_SYMBOLS = new Set(['USDC', 'DAI', 'USDT'])

export function estimateUsdValue(tokenSymbol: string, amount: string): number | undefined {
  if (STABLECOIN_SYMBOLS.has(tokenSymbol.toUpperCase())) {
    return parseFloat(amount)
  }
  // ETH and other tokens: no price feed in v1
  return undefined
}
