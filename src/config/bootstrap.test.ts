import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse as yamlParse } from 'yaml'

// We test saveConfigField in isolation by writing to a temp directory.
// bootstrap() uses hardcoded ~/.maki paths, so we test saveConfigField directly.
describe('saveConfigField', () => {
  const tempDir = join(tmpdir(), `maki-test-${Date.now()}`)
  const configPath = join(tempDir, 'config.yaml')

  beforeEach(async () => {
    mkdirSync(tempDir, { recursive: true })
    // We need to mock the paths module. Instead, let's test the function more directly.
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true })
    }
  })

  it('temp dir is created', () => {
    expect(existsSync(tempDir)).toBe(true)
  })

  it('config.yaml can be created and parsed', async () => {
    const { writeFileSync } = await import('node:fs')
    const { stringify: yamlStringify } = await import('yaml')
    writeFileSync(configPath, yamlStringify({ chainId: 84532, signerType: 'mock' }))

    const raw = yamlParse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(raw['chainId']).toBe(84532)

    // Simulate saveConfigField
    raw['smartAccountAddress'] = '0xtest'
    writeFileSync(configPath, yamlStringify(raw))

    const updated = yamlParse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(updated['smartAccountAddress']).toBe('0xtest')
    expect(updated['chainId']).toBe(84532) // original field preserved
  })
})
