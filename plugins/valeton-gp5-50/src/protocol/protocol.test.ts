import { describe, expect, it } from 'vitest'
import {
  buildPresetVolume,
  buildReadRequest,
  buildSavePreset,
  buildSelectModel,
  buildSelectPresetCc,
  buildSelectPresetSysex,
  buildSetParameter,
  buildToggle,
  coalesceKey,
  parseGp5Message,
} from './commands'
import { CMD, READ, isForbiddenFn } from './constants'
import { Reassembler, crc8, packetize, parseSysex } from './frame'

const hex = (frame: Uint8Array) => Array.from(frame, (b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (s: string) => Uint8Array.from(s.replace(/\s+/g, '').match(/../g)!, (h) => parseInt(h, 16))
const wire = (s: string) => s.replace(/\s+/g, '').toLowerCase()
const only = (frames: Uint8Array[]) => {
  expect(frames).toHaveLength(1)
  return hex(frames[0])
}

describe('frame', () => {
  it('crc8 bate com o valor de verificação do CRC-8/SMBUS', () => {
    expect(crc8(new TextEncoder().encode('123456789'))).toBe(0xf4)
  })

  it('pedidos de leitura batem com os bytes de onda conhecidos', () => {
    expect(only(buildReadRequest(READ.PRESET_NAMES))).toBe(wire('F0 00 0E 00 01 00 00 00 02 01 02 04 00 F7'))
    expect(only(buildReadRequest(READ.CURRENT_PATCH))).toBe(wire('F0 00 09 00 01 00 00 00 02 01 02 04 01 F7'))
    expect(only(buildReadRequest(READ.CURRENT_SLOT))).toBe(wire('F0 00 07 00 01 00 00 00 02 01 02 04 03 F7'))
    expect(only(buildReadRequest(READ.USER_IRS))).toBe(wire('F0 02 09 00 01 00 00 00 02 01 02 02 00 F7'))
    expect(only(buildReadRequest(READ.SNAPTONES))).toBe(wire('F0 03 05 00 01 00 00 00 02 01 02 02 04 F7'))
  })

  it('divide payloads longos em frames de 19 bytes e a remontagem devolve o original', () => {
    const payload = Array.from({ length: 45 }, (_, i) => i)
    const frames = packetize(payload)
    expect(frames).toHaveLength(3)
    const reassembler = new Reassembler()
    let result: Uint8Array | null = null
    // fora de ordem: a remontagem ordena pelo índice
    for (const f of [frames[2], frames[0], frames[1]]) {
      const parsed = parseSysex(f)!
      expect(parsed.crcOk && parsed.lenOk).toBe(true)
      result = reassembler.push(parsed)
    }
    expect(Array.from(result!)).toEqual(payload)
  })

  it('rejeita frames com CRC errado ou que não são nibbles', () => {
    expect(parseSysex(fromHex('F0 0B 02 00 01 00 00 00 03 01 04 00 08 00 01 F7'))!.crcOk).toBe(false)
    expect(parseSysex(fromHex('F0 7E 00 06 01 F7'))).toBeNull()
    expect(parseSysex(fromHex('F0 1F 00 00 00 00 00 00 F7'))).toBeNull()
  })
})

describe('comandos', () => {
  it('selecionar preset por SysEx (slot 0-based no fio)', () => {
    expect(only(buildSelectPresetSysex(6))).toBe('f00202000100000006010104030005000000000000f7')
  })

  it('selecionar preset por Control Change #0', () => {
    expect(Array.from(buildSelectPresetCc(6)[0])).toEqual([0xb0, 0, 5])
  })

  it('troca de modelo, liga/desliga, parâmetro, volume e salvar', () => {
    expect(only(buildSelectModel(3, 0x07000001))).toBe('f0050a00010000000e01010407000300000000000000030000000000000001000000000007f7')
    expect(only(buildToggle(3, true))).toBe('f0020900010000000a0101040900030000000000000001000000000000f7')
    expect(only(buildToggle(8, false))).toBe('f0090200010000000a0101040900080000000000000000000000000000f7')
    expect(only(buildSetParameter(3, 0, 70))).toBe('f00b0600010000000e010104080003000000000000000000000000000000000000080c0402f7')
    expect(only(buildSetParameter(7, 1, 500))).toBe(
      wire('F0 00 0D 00 01 00 00 00 0E 01 01 04 08 00 07 00 00 00 00 00 00 00 01 00 00 00 00 00 00 00 00 00 00 0F 0A 04 03 F7'),
    )
    expect(only(buildPresetVolume(80))).toBe(wire('F0 00 0E 00 01 00 00 00 0A 01 01 04 02 00 01 02 00 00 00 00 00 05 00 00 00 00 00 00 00 F7'))
    // 'Clean' no preset 8 (slot 7 no fio): 4 bytes de slot e o nome em 10 bytes
    expect(only(buildSavePreset(8, 'Clean'))).toBe(
      wire('F0 01 05 00 01 00 00 01 00 01 01 04 0A 00 07 00 00 00 00 00 00 04 03 06 0C 06 05 06 01 06 0E 00 00 00 00 00 00 00 00 00 00 F7'),
    )
  })

  it('valida blocos, parâmetros e presets, e limpa o nome', () => {
    expect(() => buildToggle(10, true)).toThrow()
    expect(() => buildSetParameter(0, 8, 1)).toThrow()
    expect(() => buildSelectPresetSysex(0)).toThrow()
    expect(() => buildSelectPresetSysex(101)).toThrow()
    // 10 caracteres ASCII imprimíveis, o resto é cortado ou descartado
    const frames = buildSavePreset(1, 'Çlean Tone 12345')
    const payload = parseSysex(frames[0])!.payload
    expect(Array.from(payload.subarray(6, 16)).map((c) => String.fromCharCode(c)).join('')).toBe('lean Tone ')
  })

  it('nunca emite uma função proibida', () => {
    const frames = [
      ...buildSelectModel(0, 27),
      ...buildToggle(0, true),
      ...buildSetParameter(0, 0, 1),
      ...buildSavePreset(1, 'x'),
      ...buildPresetVolume(10),
      ...buildSelectPresetSysex(1),
      ...buildReadRequest(READ.CURRENT_PATCH),
    ]
    for (const f of frames) expect(isForbiddenFn(parseSysex(f)!.payload[1])).toBe(false)
    expect(isForbiddenFn(0x3f)).toBe(true)
    expect(isForbiddenFn(0x60)).toBe(true)
    expect(isForbiddenFn(CMD.SET_PARAM)).toBe(false)
  })

  it('o mesmo parâmetro compartilha a chave de coalescência', () => {
    const a = coalesceKey(buildSetParameter(3, 2, 10)[0])
    expect(a).toBe(coalesceKey(buildSetParameter(3, 2, 99)[0]))
    expect(a).not.toBe(coalesceKey(buildSetParameter(3, 1, 10)[0]))
    expect(coalesceKey(buildToggle(3, true)[0])).toBeNull()
  })
})

describe('avisos do pedal', () => {
  it('reconhece ecos de parâmetro, bloco e modelo', () => {
    expect(parseGp5Message(buildSetParameter(7, 1, 500)[0])).toEqual({ type: 'parameter', slotId: 'DLY', paramIndex: 1, value: 500 })
    expect(parseGp5Message(buildToggle(3, true)[0])).toEqual({ type: 'toggle', slotId: 'AMP', enabled: true })
    expect(parseGp5Message(buildSelectModel(9, 0x0f000032)[0])).toEqual({ type: 'effect', slotId: 'NS', effectCode: 0x0f000032 })
  })

  it('o slot do pedal vira o preset 1-based', () => {
    const reply = packetize([0x12, READ.CURRENT_SLOT, 4, 0])
    expect(parseGp5Message(reply[0])).toEqual({ type: 'preset', preset: 5 })
  })

  it('ignora blocos desconhecidos, frames de várias partes e lixo', () => {
    expect(parseGp5Message(packetize([0x11, CMD.SET_BLOCK, 12, 0, 0, 0, 1, 0, 0, 0])[0])).toBeNull()
    expect(parseGp5Message(packetize(Array.from({ length: 40 }, () => 0x12))[0])).toBeNull()
    expect(parseGp5Message(Uint8Array.from([0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]))).toBeNull()
  })

  it('o volume do preset avisado pelo pedal vira o parâmetro do VOL', () => {
    expect(parseGp5Message(buildPresetVolume(80)[0])).toEqual({ type: 'parameter', slotId: 'VOL', paramIndex: 0, value: 80 })
  })

  it('a ordem da cadeia vira índices de slot', () => {
    // ordem de fábrica no armazenamento: NR PRE DST NS AMP CAB EQ MOD DLY RVB
    const factory = packetize([0x11, CMD.SET_ORDER, 0, 1, 2, 9, 3, 4, 5, 6, 7, 8])
    expect(parseGp5Message(factory[0])).toEqual({ type: 'chain', moduleIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] })
    expect(parseGp5Message(packetize([0x11, CMD.SET_ORDER, 0, 0, 2, 9, 3, 4, 5, 6, 7, 8])[0])).toBeNull()
  })
})
