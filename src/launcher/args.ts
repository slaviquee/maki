import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const NON_AGENT_COMMANDS = new Set([
  'config',
  'install',
  'list',
  'remove',
  'setup',
  'init',
  'signer',
  'update',
  'world',
])

export interface RuntimePaths {
  packageRoot: string
  extensionPath: string
  skillsPath: string
  agentDir: string
}

export function getRuntimePaths(importMetaUrl: string): RuntimePaths {
  const packageRoot = resolve(dirname(fileURLToPath(importMetaUrl)), '..')

  return {
    packageRoot,
    extensionPath: join(packageRoot, 'dist', 'extensions'),
    skillsPath: join(packageRoot, 'src', 'skills'),
    agentDir: join(homedir(), '.maki', 'agent'),
  }
}

export function isSetupCommand(args: string[]): boolean {
  return args[0] === 'setup' || args[0] === 'init'
}

export function isSignerCommand(args: string[]): boolean {
  return args[0] === 'signer'
}

export function isWorldCommand(args: string[]): boolean {
  return args[0] === 'world'
}

export function isAgentLaunch(args: string[]): boolean {
  if (args.length === 0) {
    return true
  }

  const [firstArg] = args
  if (!firstArg) {
    return true
  }

  if (firstArg === '-h' || firstArg === '--help' || firstArg === '-v' || firstArg === '--version') {
    return false
  }

  if (NON_AGENT_COMMANDS.has(firstArg)) {
    return false
  }

  return true
}

function hasFlag(args: string[], ...flags: string[]): boolean {
  return args.some((arg) => flags.includes(arg))
}

function translateConvenienceArgs(args: string[]): string[] {
  if (args.length === 1 && args[0] === 'doctor') {
    return ['-p', '/doctor']
  }

  return args
}

export function buildPiArgs(userArgs: string[], paths: Pick<RuntimePaths, 'extensionPath' | 'skillsPath'>): string[] {
  const translatedArgs = translateConvenienceArgs(userArgs)
  const injectedArgs: string[] = []

  if (!hasFlag(translatedArgs, '--no-extensions')) {
    injectedArgs.push('--extension', paths.extensionPath)
  }

  if (!hasFlag(translatedArgs, '--no-skills')) {
    injectedArgs.push('--skill', paths.skillsPath)
  }

  return [...injectedArgs, ...translatedArgs]
}
