import {
  Theme as PiTheme,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ThemeColor,
} from '@mariozechner/pi-coding-agent'
import { Text } from '@mariozechner/pi-tui'
import type { Component, TUI } from '@mariozechner/pi-tui'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SALMON_HEX = '#e8735a'
const PANEL_GRAY = '#2f3036'
const PANEL_GRAY_ALT = '#34353c'
const SALMON_FG = '\u001b[38;2;232;115;90m'
const SALMON_BG = '\u001b[48;2;232;115;90m'
const RICE_BG = '\u001b[48;2;240;235;224m'
const DARK_EYES_BG = '\u001b[48;2;50;50;50m'
const RESET_BG = '\u001b[49m'
const RESET_ALL = '\u001b[0m'
const BRAND_THEME_NAME = 'maki-salmon'

interface ThemeSpec {
  vars: Record<string, string>
  colors: Record<string, string>
}

function getVersion(): string {
  try {
    const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string }
    return pkg.version ?? '0.1.0'
  } catch {
    return '0.1.0'
  }
}

function getMakiMascotLines(): string[] {
  return [
    '',
    `      ${SALMON_FG}▄${SALMON_BG}    ${RESET_BG}▄${RESET_ALL}`,
    `     ${RICE_BG} ${SALMON_BG}      ${RICE_BG} ${RESET_ALL}`,
    `     ${RICE_BG}        ${RESET_ALL}`,
    `     ${RICE_BG}  ${DARK_EYES_BG} ${RICE_BG}  ${DARK_EYES_BG} ${RICE_BG}  ${RESET_ALL}`,
    `     ${RICE_BG}        ${RESET_ALL}`,
    `     ${SALMON_FG}▀${RICE_BG}      ${RESET_BG}▀${RESET_ALL}`,
    '',
  ]
}

function getPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

function loadDarkThemeSpec(): ThemeSpec {
  const themePath = resolve(
    getPackageRoot(),
    'node_modules',
    '@mariozechner',
    'pi-coding-agent',
    'dist',
    'modes',
    'interactive',
    'theme',
    'dark.json',
  )
  return JSON.parse(readFileSync(themePath, 'utf-8')) as ThemeSpec
}

function resolveThemeValue(spec: ThemeSpec, value: string): string {
  if (!value) {
    return ''
  }

  return spec.vars[value] ?? value
}

function createBrandedTheme(baseTheme: Theme): PiTheme {
  const spec = loadDarkThemeSpec()
  const fgColors = Object.fromEntries(
    Object.entries(spec.colors)
      .filter(([key]) => !key.endsWith('Bg'))
      .map(([key, value]) => [key, resolveThemeValue(spec, value)]),
  ) as Record<ThemeColor, string>

  fgColors['accent'] = SALMON_HEX
  fgColors['borderAccent'] = SALMON_HEX
  fgColors['mdCode'] = SALMON_HEX
  fgColors['mdListBullet'] = SALMON_HEX
  fgColors['bashMode'] = SALMON_HEX

  const bgColors = {
    selectedBg: PANEL_GRAY_ALT,
    userMessageBg: PANEL_GRAY_ALT,
    customMessageBg: PANEL_GRAY,
    toolPendingBg: PANEL_GRAY,
    toolSuccessBg: PANEL_GRAY,
    toolErrorBg: PANEL_GRAY,
  }

  return new PiTheme(fgColors, bgColors, baseTheme.getColorMode(), { name: BRAND_THEME_NAME })
}

function createMakiHeader(_tui: TUI, theme: Theme): Component & { dispose?(): void } {
  const version = getVersion()
  const mascot = getMakiMascotLines().join('\n')

  const logo = theme.bold(theme.fg('accent', 'maki')) + theme.fg('dim', ` v${version}`)

  const tagline = theme.fg(
    'dim',
    [
      'On-chain terminal agent — check balances, send tokens, swap on Uniswap,',
      'manage approvals. Private keys stay in Apple Secure Enclave.',
    ].join('\n'),
  )

  const examples = [
    theme.fg('dim', 'Try:'),
    `  ${theme.fg('accent', '"Create my smart account"')}`,
    `  ${theme.fg('accent', '"Check my balance"')}`,
    `  ${theme.fg('accent', '"Swap 0.001 ETH to USDC"')}`,
    `  ${theme.fg('accent', '"Send 0.001 USDC to vitalik.eth"')}`,
    `  ${theme.fg('accent', '/doctor')} ${theme.fg('dim', '— health checks')}    ${theme.fg('accent', '/about')} ${theme.fg('dim', '— what is maki?')}`,
  ].join('\n')

  return new Text(`${mascot}${logo}\n${tagline}\n\n${examples}`, 1, 0)
}

const ABOUT_TEXT = [
  'maki — on-chain terminal agent',
  '',
  'Maki lets you manage an ERC-4337 smart account from your terminal.',
  'Ask in plain English to check balances, send tokens, swap on Uniswap,',
  'resolve ENS names, inspect approvals, or interact with Aave.',
  '',
  'Security:',
  '  Private keys live in Apple Secure Enclave — the AI never sees them.',
  '  Every write: deterministic build > simulate > policy check >',
  '  human-readable summary > Touch ID > sign > submit.',
  '',
  'Commands:',
  '  /doctor    Health checks (signer, RPC, policy, account)',
  '  /about     This message',
  '  /login     Connect to a model provider',
  '',
  'Getting started:',
  '  1. maki signer start     (in a separate terminal)',
  '  2. /login                 (pick your model provider)',
  '  3. "Create my smart account"',
  '  4. Fund your address and go',
].join('\n')

/**
 * Register the /about command. Called once at extension init.
 */
export function registerBrandingCommands(pi: ExtensionAPI): void {
  pi.registerCommand('about', {
    description: 'Show what maki is and how it works',
    handler: async (_args, ctx) => {
      ctx.ui.notify(ABOUT_TEXT, 'info')
    },
  })
}

/**
 * Apply branded header and terminal title. Called during session_start
 * when UI is available.
 */
export function applyBrandingUI(extCtx: ExtensionContext): void {
  if (extCtx.hasUI) {
    const baseTheme = extCtx.ui.getTheme('dark') ?? extCtx.ui.theme
    extCtx.ui.setTheme(createBrandedTheme(baseTheme))
    extCtx.ui.setHeader(createMakiHeader)
    extCtx.ui.setTitle('maki')
  }
}
