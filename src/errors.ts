/**
 * Typed error system per spec:
 * "Errors must be specific, never vague 'transaction failed.'"
 *
 * Distinguishes: model misunderstanding, unsupported intent, insufficient balance,
 * allowance issue, simulation failure, slippage/market moved, signer unavailable,
 * local auth cancelled, bundler failure, on-chain revert, receipt timeout, policy denial.
 */

export type MakiErrorCode =
  | 'UNSUPPORTED_INTENT'
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_ALLOWANCE'
  | 'SIMULATION_FAILED'
  | 'SLIPPAGE_EXCEEDED'
  | 'SIGNER_UNAVAILABLE'
  | 'AUTH_CANCELLED'
  | 'BUNDLER_FAILURE'
  | 'ON_CHAIN_REVERT'
  | 'RECEIPT_TIMEOUT'
  | 'POLICY_DENIED'
  | 'TOKEN_NOT_FOUND'
  | 'ENS_RESOLUTION_FAILED'
  | 'NO_WALLET'
  | 'AAVE_NOT_AVAILABLE'
  | 'NO_LIQUIDITY'
  | 'CONFIG_ERROR'

export class MakiError extends Error {
  readonly code: MakiErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: MakiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'MakiError'
    this.code = code
    this.details = details
  }

  toUserMessage(): string {
    switch (this.code) {
      case 'INSUFFICIENT_BALANCE':
        return `Not enough balance: ${this.message}`
      case 'INSUFFICIENT_ALLOWANCE':
        return `Token approval needed: ${this.message}`
      case 'SIMULATION_FAILED':
        return `Transaction would fail: ${this.message}`
      case 'SLIPPAGE_EXCEEDED':
        return `Price moved too much: ${this.message}`
      case 'SIGNER_UNAVAILABLE':
        return `Signer not connected: ${this.message}`
      case 'AUTH_CANCELLED':
        return `Authentication cancelled: ${this.message}`
      case 'BUNDLER_FAILURE':
        return `Transaction submission failed: ${this.message}`
      case 'ON_CHAIN_REVERT':
        return `Transaction reverted on-chain: ${this.message}`
      case 'RECEIPT_TIMEOUT':
        return `Transaction not confirmed in time: ${this.message}`
      case 'POLICY_DENIED':
        return `Blocked by security policy: ${this.message}`
      case 'TOKEN_NOT_FOUND':
        return `Token not recognized: ${this.message}`
      case 'ENS_RESOLUTION_FAILED':
        return `ENS lookup failed: ${this.message}`
      case 'NO_WALLET':
        return `No wallet configured. Run setup first.`
      case 'AAVE_NOT_AVAILABLE':
        return `Aave is not available on this chain.`
      case 'NO_LIQUIDITY':
        return `No liquidity found: ${this.message}`
      default:
        return this.message
    }
  }
}
