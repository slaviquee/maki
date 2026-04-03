import { homedir } from 'node:os'
import { join } from 'node:path'

const MAKI_DIR = join(homedir(), '.maki')

export const paths = {
  root: MAKI_DIR,
  config: join(MAKI_DIR, 'config.yaml'),
  policy: join(MAKI_DIR, 'policy.yaml'),
  socket: join(MAKI_DIR, 'signer.sock'),
  db: join(MAKI_DIR, 'db', 'maki.db'),
  dbDir: join(MAKI_DIR, 'db'),
  keysDir: join(MAKI_DIR, 'keys'),
} as const
