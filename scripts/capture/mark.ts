/**
 * Marca na sessão o que o usuário vai fazer agora: tudo que o pedal mandar depois entra nesse passo, até a próxima marca.
 * Uso: `bun run mark <sessão> "liga o DLY"`   ·   `bun run mark <sessão> --` (repouso: o que chegar aqui é ruído de fundo)
 */
import { IDLE_LABEL, appendEvent } from './session'

const [session, ...rest] = process.argv.slice(2)
const label = rest.join(' ').trim()
if (!session || !label) {
  console.error('Uso: bun run mark <sessão> "<o que o usuário vai fazer>"   (ou -- para repouso)')
  process.exit(1)
}
const t = Date.now() / 1000
appendEvent(session, { kind: 'mark', t, label: label === '--' ? IDLE_LABEL : label })
console.log(`marca: ${label}`)
