/**
 * Lê, em tempo real, a saída do `tshark -x -t e` (captura USBPcap no Windows) pela entrada padrão, decodifica o USB-MIDI
 * e grava `captures/<sessão>/events.jsonl`, uma linha por mensagem, na hora. Também escreve uma linha legível por mensagem.
 *
 * Uso (no Windows, via `scripts/capture/capture.cmd`):
 *   tshark -i \\.\USBPcap1 -l -x -t e | bun scripts/capture/live.ts <sessão> [--device N] [--endpoint N] [--mode auto|midi|raw] [--list] [--all]
 *
 *   --list      não grava: mostra quantos pacotes cada dispositivo/endpoint mandou, para achar o pedal.
 *   --device    só esse dispositivo (número que o `--list` mostrou).
 *   --mode raw  não interpreta como USB-MIDI (protocolos próprios, HID): grava os bytes de cada transferência.
 *   --all       inclui transferências de controle (padrão: só bulk e interrupt).
 */
import { HexdumpParser, parseUsbpcap, type UsbPacket } from './usbpcap'
import { SysexAssembler, looksLikeUsbMidi } from './usbmidi'
import { appendEvent, bytesToHex, type CaptureEvent } from './session'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}
const session = args.find((arg, i) => !arg.startsWith('--') && !['--device', '--endpoint', '--mode'].includes(args[i - 1] ?? ''))
if (!session && !flag('list')) {
  console.error('Uso: tshark ... | bun scripts/capture/live.ts <sessão> [--device N] [--endpoint N] [--mode auto|midi|raw] [--list] [--all]')
  process.exit(1)
}

const wantDevice = option('device') === undefined ? undefined : Number(option('device'))
const wantEndpoint = option('endpoint') === undefined ? undefined : Number(option('endpoint'))
const mode = option('mode') ?? 'auto'

const assemblers = new Map<string, SysexAssembler>()
const seen = new Map<string, number>()
let lastListing = ''

const clock = (t: number) => new Date(t * 1000).toISOString().slice(11, 23)

function emit(event: CaptureEvent) {
  appendEvent(session!, event)
  if (event.kind === 'mark') return
  const arrow = event.dir === 'in' ? '← pedal' : '→ pedal'
  const bytes = event.hex.split(' ')
  const shown = bytes.length > 48 ? `${bytes.slice(0, 48).join(' ')} …` : event.hex
  console.log(`${clock(event.t)} ${arrow} ${event.kind.toUpperCase().padEnd(5)} dev ${event.device} ep ${event.endpoint} ${String(bytes.length).padStart(4)}B  ${shown}`)
}

function handle(packet: UsbPacket) {
  if (packet.data.length === 0) return
  if (packet.transfer === 'control' && !flag('all')) return
  if (wantDevice !== undefined && packet.device !== wantDevice) return
  if (wantEndpoint !== undefined && packet.endpoint !== wantEndpoint) return

  if (flag('list')) {
    const key = `dispositivo ${packet.device}  endpoint ${packet.endpoint} ${packet.dir === 'in' ? 'IN ' : 'OUT'} ${packet.transfer}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
    const listing = [...seen].sort().map(([k, n]) => `${k}: ${n} pacotes`).join('\n')
    if (listing !== lastListing) {
      lastListing = listing
      console.log(`\n${listing}`)
    }
    return
  }

  const base = { t: packet.time, dir: packet.dir, device: packet.device, endpoint: packet.endpoint } as const
  if (mode === 'raw' || (mode === 'auto' && !looksLikeUsbMidi(packet.data))) {
    emit({ ...base, kind: 'raw', hex: bytesToHex(packet.data) })
    return
  }
  const key = `${packet.device}:${packet.endpoint}:${packet.dir}`
  let assembler = assemblers.get(key)
  if (!assembler) assemblers.set(key, (assembler = new SysexAssembler()))
  for (const message of assembler.push(packet.data)) emit({ ...base, kind: message.kind, hex: bytesToHex(message.bytes) })
}

const parser = new HexdumpParser()
function feed(line: string) {
  const done = parser.push(line)
  if (!done) return
  const packet = parseUsbpcap(done.bytes, done.time)
  if (packet) handle(packet)
}

console.error(flag('list') ? 'Mexa no pedal (gire um knob, troque o preset). Ctrl+C encerra.' : `Gravando em captures/${session}/events.jsonl. Ctrl+C encerra.`)
let pending = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) {
  pending += chunk
  const lines = pending.split('\n')
  pending = lines.pop() ?? ''
  for (const line of lines) feed(line.replace(/\r$/, ''))
}
feed(pending)
feed('')
