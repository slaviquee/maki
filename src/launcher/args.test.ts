import { describe, expect, it } from 'vitest'
import { buildPiArgs, isAgentLaunch, isSetupCommand, isSignerCommand, isWorldCommand } from './args.js'

describe('launcher args', () => {
  it('detects setup command aliases', () => {
    expect(isSetupCommand(['setup'])).toBe(true)
    expect(isSetupCommand(['init'])).toBe(true)
    expect(isSetupCommand(['doctor'])).toBe(false)
  })

  it('detects signer command', () => {
    expect(isSignerCommand(['signer'])).toBe(true)
    expect(isSignerCommand(['setup'])).toBe(false)
  })

  it('detects world command', () => {
    expect(isWorldCommand(['world'])).toBe(true)
    expect(isWorldCommand(['setup'])).toBe(false)
  })

  it('treats package management commands as non-agent launches', () => {
    expect(isAgentLaunch(['install', 'npm:foo'])).toBe(false)
    expect(isAgentLaunch(['signer', 'start'])).toBe(false)
    expect(isAgentLaunch(['world', 'status'])).toBe(false)
    expect(isAgentLaunch(['setup'])).toBe(false)
  })

  it('treats prompts as normal agent launches', () => {
    expect(isAgentLaunch([])).toBe(true)
    expect(isAgentLaunch(['Check my balance'])).toBe(true)
    expect(isAgentLaunch(['doctor'])).toBe(true)
  })

  it('injects maki extension and skills into pi args', () => {
    expect(
      buildPiArgs(['Check my balance'], {
        extensionPath: '/pkg/dist/extensions',
        skillsPath: '/pkg/src/skills',
      }),
    ).toEqual(['--extension', '/pkg/dist/extensions', '--skill', '/pkg/src/skills', 'Check my balance'])
  })

  it('keeps explicit no-extension flags intact', () => {
    expect(
      buildPiArgs(['--no-extensions', '--no-skills'], {
        extensionPath: '/pkg/dist/extensions',
        skillsPath: '/pkg/src/skills',
      }),
    ).toEqual(['--no-extensions', '--no-skills'])
  })

  it('maps doctor to a one-shot slash command', () => {
    expect(
      buildPiArgs(['doctor'], {
        extensionPath: '/pkg/dist/extensions',
        skillsPath: '/pkg/src/skills',
      }),
    ).toEqual(['--extension', '/pkg/dist/extensions', '--skill', '/pkg/src/skills', '-p', '/doctor'])
  })
})
