import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify as yamlStringify } from 'yaml'
import { createPolicyStore } from './store.js'

describe('createPolicyStore', () => {
  let tempDir: string
  let policyPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'maki-policy-'))
    policyPath = join(tempDir, 'policy.yaml')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('loads legacy USD keys as USDC spending limits', () => {
    writeFileSync(
      policyPath,
      yamlStringify({
        version: 1,
        profile: 'locked',
        account: { chain: 'base-sepolia' },
        approval: {
          low_risk: 'touch_id',
          medium_risk: 'touch_id',
          high_risk: 'touch_id',
          admin: 'touch_id',
          timeout_seconds: 180,
        },
        limits: {
          transfer_per_tx_usd: 100,
          transfer_daily_usd: 300,
          swap_per_tx_usd: 200,
          swap_daily_usd: 500,
          max_slippage_bps: 50,
          max_gas_usd: 10,
        },
        allowlists: {
          recipients: [],
          protocols: ['uniswap'],
          tokens: ['USDC'],
          chains: ['base'],
        },
        dangerous_actions: {
          unlimited_approvals: false,
          new_recipients: 'ask',
          new_protocols: 'ask',
          arbitrary_calldata: 'deny',
          contract_upgrades: 'deny',
          owner_changes: 'deny',
        },
        automation: {
          enabled: false,
          allowed_actions: [],
          auto_execute: false,
        },
      }),
    )

    const policy = createPolicyStore(policyPath).load()
    expect(policy.limits.transfer_per_tx_usdc).toBe(100)
    expect(policy.limits.transfer_daily_usdc).toBe(300)
    expect(policy.limits.swap_per_tx_usdc).toBe(200)
    expect(policy.limits.swap_daily_usdc).toBe(500)
  })

  it('accepts ethereum-sepolia as a valid policy chain', () => {
    writeFileSync(
      policyPath,
      yamlStringify({
        version: 1,
        profile: 'locked',
        account: { chain: 'ethereum-sepolia' },
        approval: {
          low_risk: 'touch_id',
          medium_risk: 'touch_id',
          high_risk: 'touch_id',
          admin: 'touch_id',
          timeout_seconds: 180,
        },
        limits: {
          transfer_per_tx_usdc: 100,
          transfer_daily_usdc: 300,
          swap_per_tx_usdc: 200,
          swap_daily_usdc: 500,
          max_slippage_bps: 50,
          max_gas_usd: 10,
        },
        allowlists: {
          recipients: [],
          protocols: ['uniswap'],
          tokens: ['ETH', 'USDC'],
          chains: ['ethereum'],
        },
        dangerous_actions: {
          unlimited_approvals: false,
          new_recipients: 'ask',
          new_protocols: 'ask',
          arbitrary_calldata: 'deny',
          contract_upgrades: 'deny',
          owner_changes: 'deny',
        },
        automation: {
          enabled: false,
          allowed_actions: [],
          auto_execute: false,
        },
      }),
    )

    const policy = createPolicyStore(policyPath).load()
    expect(policy.account.chain).toBe('ethereum-sepolia')
  })
})
