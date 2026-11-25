/**
 * Resume uma sessão por passo (entre uma marca e a próxima), sem o ruído que já apareceu em repouso.
 * Uso:
 *   bun run report <sessão>                    todos os passos, em Markdown
 *   bun run report <sessão> --last             só o último passo (para o agente conferir na hora)
 *   bun run report <sessão> --compare "A" "B"  bytes que mudam entre a 1ª mensagem do passo A e a do passo B
 *   bun run report <sessão> --out arquivo.md   grava em vez de imprimir  ·  --keep-noise não filtra o repouso
 */
import { writeFileSync } from 'node:fs'
import { IDLE_LABEL, bytesToHex, hexToBytes, readEvents, type CaptureEvent } from './session'

type Message = Exclude<CaptureEvent, { kind: 'mark' }>
export interface Step {
  label: string
  messages: Message[]
}

export function splitSteps(events: CaptureEvent[], keepNoise = false): Step[] {
  const steps: Step[] = []
  let current: Step | null = null
  for (const event of [...events].sort((a, b) => a.t - b.t)) {
    if (event.kind === 'mark') steps.push((current = { label: event.label, messages: [] }))
    else current?.messages.push(event)
  }
  const noise = new Set(steps.filter((s) => s.label === IDLE_LABEL).flatMap((s) => s.messages.map(key)))
  return steps
    .filter((s) => s.label !== IDLE_LABEL)
    .map((s) => ({ ...s, messages: keepNoise ? s.messages : s.messages.filter((m) => !noise.has(key(m))) }))
}

const key = (m: Message) => `${m.dir}|${m.hex}`

/** Posições em que as duas mensagens diferem (e se o tamanho muda). */
export function compareBytes(a: number[], b: number[]) {
  const diffs: { index: number; a: number | null; b: number | null }[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diffs.push({ index: i, a: a[i] ?? null, b: b[i] ?? null })
  return { sameLength: a.length === b.length, diffs }
}

const short = (hex: string) => (hex.split(' ').length > 40 ? `${hex.split(' ').slice(0, 40).join(' ')} …` : hex)

function stepToMarkdown(step: Step): string {
  if (step.messages.length === 0) return `### ${step.label}\n\n_Nenhuma mensagem nova._\n`
  const unique = new Map<string, { m: Message; n: number }>()
  for (const m of step.messages) {
    const k = key(m)
    unique.set(k, { m, n: (unique.get(k)?.n ?? 0) + 1 })
  }
  const rows = [...unique.values()].map(({ m, n }) => `| ${m.dir === 'in' ? '← pedal' : '→ pedal'} | ${m.kind} | ${m.hex.split(' ').length} | ${n} | \`${short(m.hex)}\` |`)
  return `### ${step.label}\n\n| Sentido | Tipo | Bytes | Vezes | Dados |\n|---|---|---|---|---|\n${rows.join('\n')}\n`
}

export function compareSteps(steps: Step[], labelA: string, labelB: string): string {
  const first = (label: string, dir: 'in' | 'out') => steps.find((s) => s.label === label)?.messages.find((m) => m.dir === dir)
  const lines = [`## Diferenças: "${labelA}" × "${labelB}"\n`]
  for (const dir of ['out', 'in'] as const) {
    const a = first(labelA, dir)
    const b = first(labelB, dir)
    if (!a || !b) continue
    const { sameLength, diffs } = compareBytes(hexToBytes(a.hex), hexToBytes(b.hex))
    lines.push(`**${dir === 'out' ? '→ pedal' : '← pedal'}**: ${sameLength ? 'mesmo tamanho' : 'tamanhos diferentes'}, ${diffs.length} byte(s) mudam.\n`)
    if (diffs.length > 0) lines.push('| Posição | A | B |\n|---|---|---|', ...diffs.slice(0, 40).map((d) => `| ${d.index} | ${d.a === null ? '—' : bytesToHex([d.a])} | ${d.b === null ? '—' : bytesToHex([d.b])} |`), '')
  }
  if (lines.length === 1) lines.push('Não há mensagens do mesmo sentido nos dois passos.')
  return lines.join('\n')
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const session = args.find((a) => !a.startsWith('--'))
  if (!session) {
    console.error('Uso: bun run report <sessão> [--last] [--compare "A" "B"] [--out arquivo.md] [--keep-noise]')
    process.exit(1)
  }
  const steps = splitSteps(readEvents(session), args.includes('--keep-noise'))
  const compareAt = args.indexOf('--compare')
  const outAt = args.indexOf('--out')
  const text =
    compareAt !== -1
      ? compareSteps(steps, args[compareAt + 1], args[compareAt + 2])
      : args.includes('--last')
        ? stepToMarkdown(steps[steps.length - 1] ?? { label: '(nenhum passo)', messages: [] })
        : `# Captura ${session}\n\n${steps.map(stepToMarkdown).join('\n')}`
  if (outAt !== -1) {
    writeFileSync(args[outAt + 1], text)
    console.log(`✓ ${args[outAt + 1]}`)
  } else console.log(text)
}
