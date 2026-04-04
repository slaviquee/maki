/**
 * MVP spending caps are denominated directly in USDC.
 *
 * This keeps the control deterministic and avoids relying on live price quotes
 * or best-effort token valuation before policy enforcement.
 */
export function getUsdcSpendingCapAmount(tokenSymbol: string, amount: string): number | undefined {
  if (tokenSymbol.toUpperCase() !== 'USDC') {
    return undefined
  }

  const parsedAmount = parseFloat(amount)
  return Number.isFinite(parsedAmount) ? parsedAmount : undefined
}
