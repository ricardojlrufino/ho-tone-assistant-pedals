import { spawnSync } from 'node:child_process'
import { rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HexdumpParser, parseUsbpcap } from './usbpcap'
import { SysexAssembler, encodeSysex, looksLikeUsbMidi } from './usbmidi'
import { compareBytes, compareSteps, splitSteps } from './report'
import type { CaptureEvent } from './session'
import { tsharkText, usbpcapFrame } from './fixtures'

const SYSEX = [0xf0, 0x7d, 0x01, 0x01, 0x02, 0x01, 0x02, 0xf7]

describe('USB-MIDI', () => {
  it('remonta um SysEx repartido em vários blocos', () => {
    const [message] = new SysexAssembler().push(encodeSysex(SYSEX))
    expect(message).toEqual({ kind: 'sysex', cable: 0, bytes: SYSEX })
  })

  it('remonta quando o SysEx chega em duas transferências', () => {
    const data = encodeSysex(SYSEX)
    const assembler = new SysexAssembler()
    expect(assembler.push(data.subarray(0, 4))).toEqual([])
    expect(assembler.push(data.subarray(4))[0].bytes).toEqual(SYSEX)
  })

  it('SysEx de 1, 2 e 3 bytes no último bloco', () => {
    for (const length of [4, 5, 6, 7, 9]) {
      const frame = [0xf0, ...Array.from({ length: length - 2 }, (_, i) => i + 1), 0xf7]
      expect(new SysexAssembler().push(encodeSysex(frame))[0].bytes).toEqual(frame)
    }
  })

  it('mensagens curtas (CC, program change) e preenchimento zerado', () => {
    const messages = new SysexAssembler().push(Uint8Array.from([0x0b, 0xb0, 0x00, 0x03, 0x0c, 0xc0, 0x05, 0x00, 0, 0, 0, 0]))
    expect(messages.map((m) => m.bytes)).toEqual([[0xb0, 0x00, 0x03], [0xc0, 0x05]])
  })

  it('distingue USB-MIDI de dados soltos', () => {
    expect(looksLikeUsbMidi(encodeSysex(SYSEX))).toBe(true)
    expect(looksLikeUsbMidi(Uint8Array.from([1, 2, 3]))).toBe(false)
    expect(looksLikeUsbMidi(Uint8Array.from([0x00, 0xff, 0xff, 0xff]))).toBe(false)
  })
})

describe('USBPcap + hexdump do tshark', () => {
  it('lê o cabeçalho: dispositivo, endpoint, sentido e dados', () => {
    const packet = parseUsbpcap(Uint8Array.from(usbpcapFrame({ device: 7, endpoint: 0x81, data: [1, 2, 3, 4] })), 10)!
    expect(packet).toMatchObject({ device: 7, endpoint: 1, dir: 'in', transfer: 'bulk', time: 10 })
    expect(Array.from(packet.data)).toEqual([1, 2, 3, 4])
    expect(parseUsbpcap(Uint8Array.from([1, 2, 3]), 0)).toBeNull()
  })

  it('o hexdump volta aos mesmos bytes, mesmo com ASCII que parece hexadecimal', () => {
    const frame = usbpcapFrame({ endpoint: 1, data: encodeSysex(SYSEX) })
    const parser = new HexdumpParser()
    const out = tsharkText([{ time: 1732540000.5, bytes: frame }])
      .split('\n')
      .map((line) => parser.push(line))
      .filter(Boolean)
    expect(out).toHaveLength(1)
    expect(Array.from(out[0]!.bytes)).toEqual(frame)
    expect(out[0]!.time).toBe(1732540000.5)
  })
})

describe('relatório', () => {
  const msg = (t: number, hex: string, dir: 'in' | 'out' = 'out'): CaptureEvent => ({ kind: 'sysex', t, dir, device: 5, endpoint: 1, hex })
  const events: CaptureEvent[] = [
    { kind: 'mark', t: 1, label: '--' },
    msg(1.1, 'f0 7d 00 f7', 'in'),
    { kind: 'mark', t: 2, label: 'liga DLY' },
    msg(2.1, 'f0 7d 01 02 01 f7'),
    msg(2.2, 'f0 7d 00 f7', 'in'),
    { kind: 'mark', t: 3, label: 'desliga DLY' },
    msg(3.1, 'f0 7d 01 02 00 f7'),
  ]

  it('separa por passo e tira o que já aparecia em repouso', () => {
    const steps = splitSteps(events)
    expect(steps.map((s) => s.label)).toEqual(['liga DLY', 'desliga DLY'])
    expect(steps[0].messages.map((m) => m.hex)).toEqual(['f0 7d 01 02 01 f7'])
    expect(splitSteps(events, true)[0].messages).toHaveLength(2)
  })

  it('aponta os bytes que mudam entre dois passos', () => {
    expect(compareBytes([1, 2, 3], [1, 9, 3, 4])).toEqual({ sameLength: false, diffs: [{ index: 1, a: 2, b: 9 }, { index: 3, a: null, b: 4 }] })
    const text = compareSteps(splitSteps(events), 'liga DLY', 'desliga DLY')
    expect(text).toContain('1 byte(s) mudam')
    expect(text).toContain('| 4 | 01 | 00 |')
  })
})

describe('leitor ao vivo (processo real)', () => {
  it('lê o tshark -x pela entrada padrão e grava o JSONL', () => {
    const session = `teste-${process.pid}-${Date.now()}`
    const text = tsharkText([
      { time: 1000.1, bytes: usbpcapFrame({ endpoint: 0x01, data: encodeSysex(SYSEX) }) },
      { time: 1000.2, bytes: usbpcapFrame({ endpoint: 0x81, data: encodeSysex([0xf0, 0x7d, 0x09, 0xf7]) }) },
      { time: 1000.3, bytes: usbpcapFrame({ device: 9, endpoint: 0x81, data: encodeSysex([0xf0, 0x01, 0xf7]) }) },
      { time: 1000.4, bytes: usbpcapFrame({ endpoint: 0x82, transfer: 2, data: [1, 2, 3, 4] }) },
    ])
    const here = fileURLToPath(new URL('.', import.meta.url))
    const run = spawnSync('bun', [join(here, 'live.ts'), session, '--device', '5'], { input: text, encoding: 'utf8' })
    const stdout = run.stdout
    const dir = join(here, '..', '..', 'captures', session)
    const lines = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    rmSync(dir, { recursive: true, force: true })
    expect(lines.map((l) => [l.dir, l.kind, l.hex])).toEqual([
      ['out', 'sysex', 'f0 7d 01 01 02 01 02 f7'],
      ['in', 'sysex', 'f0 7d 09 f7'],
    ])
    expect(stdout).toContain('→ pedal SYSEX')
    expect(stdout).toContain('← pedal SYSEX')
  })
})

