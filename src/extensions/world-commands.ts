import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import type { MakiContext } from './context.js'
import { worldStatusText } from '../launcher/world.js'

export function registerWorldCommands(pi: ExtensionAPI, getCtx: () => MakiContext): void {
  pi.registerCommand('world', {
    description: 'World AgentKit status and registration helpers (usage: /world status | /world register)',
    handler: async (args, ctx) => {
      const subcommand = args.trim().toLowerCase() || 'status'
      const maki = getCtx()

      if (subcommand === 'status') {
        ctx.ui.notify(worldStatusText(maki.config), 'info')
        return
      }

      if (subcommand === 'register') {
        if (!maki.config.smartAccountAddress) {
          ctx.ui.notify('Create your smart account first, then retry /world register.', 'warning')
          return
        }

        const lines = [
          'World AgentKit registration runs outside the chat shell so the QR flow stays readable.',
          '',
          'Open another terminal and run:',
          '  maki world register',
          '',
          `Smart account: ${maki.config.smartAccountAddress}`,
        ]

        if (!maki.config.world.enabled) {
          lines.push(
            '',
            'World AgentKit is currently disabled in settings. You can still register now, or rerun `maki setup` to enable it formally.',
          )
        }

        ctx.ui.notify(lines.join('\n'), 'info')
        return
      }

      ctx.ui.notify('Unknown /world subcommand. Use /world status or /world register.', 'warning')
    },
  })
}
