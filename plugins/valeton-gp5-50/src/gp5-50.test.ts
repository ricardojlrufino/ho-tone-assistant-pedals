import { describe, expect, it } from 'vitest'
import type { DeviceProfile, MidiLink } from '../../../sdk/types'
import { gp50Profile, gp5Profile } from './index'
import { BODY_LENGTH, KIND, READ, SLOTS, type Gp5Device } from './protocol/constants'
import { packetize, parseSysex } from './protocol/frame'
import { decodePatchBody, deviceByBodyLength, patchBodyToSnapshot } from './protocol/patch'
import { createGp5Sync, decodePresetNames, decodeSnapToneNames, decodeUserIrNames } from './sync'

function f32(v: number): number[] {
  const view = new DataView(new ArrayBuffer(4))
  view.setFloat32(0, v, true)
  return [0, 1, 2, 3].map((i) => view.getUint8(i))
}
const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
const rec = (tag: number, data: number[]) => [tag & 0xff, tag >> 8, data.length & 0xff, data.length >> 8, ...data]

/** Corpo 0x41 sintético no formato do pedal; NR=0 … RVB=8, NS=9 no armazenamento. */
function buildBody(device: Gp5Device, opts: { mask?: number; order?: number[]; fxids?: number[]; params?: (block: number, i: number) => number } = {}) {
  const { mask = 0b0000001010, order = [0, 1, 2, 9, 3, 4, 5, 6, 7, 8], fxids = [27, 0, 50331648, 117440513, 167772161, 16777269, 150994944, 184549376, 201326592, 0x0f000032] } = opts
  const params = Array.from({ length: 80 }, (_, i) => (opts.params ? opts.params(Math.floor(i / 8), i % 8) : 0))
  const tone = [
    ...rec(0x3001, u32(mask)),
    ...rec(0x3002, order),
    ...rec(0x3003, fxids.flatMap(u32)),
    ...rec(0x3004, params.flatMap(f32)),
  ]
  const settings =
    device === 'gp5'
      ? [...rec(0x2001, u32(80)), ...rec(0x2002, u32(120))]
      : [
          ...rec(0x2001, [80]),
          ...rec(0x2002, u32(120)),
          // EXP do GP-50 (ids 3..10): 1, 4, 4, 1, 1, 1, 1, 1 bytes
          ...[1, 4, 4, 1, 1, 1, 1, 1].flatMap((size, i) => rec(0x2003 + i, new Array(size).fill(0))),
        ]
  const body = [
    ...rec(0x00ff, new Array(16).fill(0)),
    ...rec(0x0000, new Array(16).fill(0)),
    ...rec(0x0001, settings),
    ...rec(0x0002, tone),
    ...rec(0x0003, new Array(device === 'gp5' ? 8 : 10).fill(0)),
  ]
  return Uint8Array.from(body)
}

describe('corpo do preset (0x41)', () => {
  it('tem o tamanho de cada pedal', () => {
    expect(buildBody('gp5').length).toBe(BODY_LENGTH.gp5)
    expect(buildBody('gp50').length).toBe(BODY_LENGTH.gp50)
    expect(deviceByBodyLength(466)).toBe('gp5')
    expect(deviceByBodyLength(511)).toBe('gp50')
    expect(deviceByBodyLength(500)).toBeNull()
  })

  it.each(['gp5', 'gp50'] as const)('decodifica o estado do %s', (device) => {
    const body = decodePatchBody(buildBody(device, { params: (block, i) => (block === 7 && i === 1 ? 500 : block === 3 && i === 2 ? 0.1 : 0) }))
    expect(body.volume).toBe(80)
    expect(body.bpm).toBe(120)
    const snapshot = patchBodyToSnapshot(body)
    // máscara 0b1010 = blocos 1 (PRE) e 3 (AMP)
    expect(Object.fromEntries(Object.entries(snapshot.slots).map(([id, s]) => [id, s.enabled]))).toEqual({
      NR: false, PRE: true, DST: false, NS: false, AMP: true, CAB: false, EQ: false, MOD: false, DLY: false, RVB: false, VOL: true,
    })
    expect(snapshot.slots.DLY.parameters[1]).toBe(500)
    expect(snapshot.slots.AMP.parameters[2]).toBe(0.1)
    expect(snapshot.slots.NS.effectCode).toBe(0x0f000032)
    expect(snapshot.presetVolume).toBe(80)
    // ordem de fábrica = ordem dos slots
    expect(snapshot.chainOrder).toEqual([...SLOTS.map((_, i) => i), SLOTS.length])
    expect(snapshot.slots.VOL).toEqual({ enabled: true, effectCode: 1, parameters: { 0: 80 } })
  })

  it('a ordem lida vira posições por slot', () => {
    // NS (bloco 9) movido para o fim da cadeia
    const snapshot = patchBodyToSnapshot(decodePatchBody(buildBody('gp50', { order: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] })))
    const ns = SLOTS.findIndex((s) => s.id === 'NS')
    expect(snapshot.chainOrder[ns]).toBe(9)
  })

  it('recusa corpos sem o registro de tom ou cortados', () => {
    expect(() => decodePatchBody(buildBody('gp5').subarray(0, 100))).toThrow()
    expect(() => decodePatchBody(Uint8Array.from([0x01, 0x00, 0x02, 0x00, 0, 0]))).toThrow(/tom/)
  })
})

describe('nomes', () => {
  const entry = (id: number, name: string) => [...u32(id), ...Array.from({ length: 16 }, (_, i) => name.charCodeAt(i) || 0)]

  it('lê os nomes dos presets na ordem do slot', () => {
    const data = Uint8Array.from([0x12, READ.PRESET_NAMES, ...entry(7, 'Clean'), ...entry(3, '')])
    expect(decodePresetNames(data)).toEqual(['Clean', ''])
  })

  it('SnapTones e IRs: ignora os vazios e usa o fxid do slot', () => {
    const flags = new Array(80).fill(1)
    flags[50] = 0
    const names = Array.from({ length: 80 }, (_, i) => (i === 0 ? 'Brit 800' : i === 50 ? 'Meu Amp' : 'Empty'))
    const snap = Uint8Array.from([0x12, READ.SNAPTONES, ...flags, ...names.flatMap((n) => Array.from({ length: 16 }, (_, i) => n.charCodeAt(i) || 0))])
    expect(decodeSnapToneNames(snap, 0x0f000000)).toEqual({ 0x0f000000: 'Brit 800', 0x0f000032: 'Meu Amp' })

    const irFlags = new Array(20).fill(1)
    irFlags[2] = 0
    const irNames = Array.from({ length: 20 }, (_, i) => (i === 2 ? 'Cab 4x12' : `User IR ${i + 1}`))
    const irs = Uint8Array.from([0x12, READ.USER_IRS, ...irFlags, ...irNames.flatMap((n) => Array.from({ length: 16 }, (_, i) => n.charCodeAt(i) || 0))])
    expect(decodeUserIrNames(irs, 0x0a100000)).toEqual({ 0x0a100002: 'Cab 4x12' })
  })
})

/** Enlace simulado: responde à leitura pedida com o payload montado pelo teste. */
function mockLink(replies: Record<number, number[]>): MidiLink & { sent: Uint8Array[] } {
  const listeners = new Set<(frame: Uint8Array) => void>()
  const sent: Uint8Array[] = []
  return {
    kind: 'usb',
    name: 'mock',
    sent,
    send: (frame) => {
      sent.push(frame)
      const payload = parseSysex(frame)!.payload
      const reply = replies[payload[1]]
      if (payload[0] === KIND.GET && reply) setTimeout(() => packetize(reply).forEach((f) => listeners.forEach((l) => l(f))), 0)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

describe('sync', () => {
  it('readState junta as respostas de vários frames e devolve o snapshot', async () => {
    const link = mockLink({ [READ.CURRENT_PATCH]: [0x12, READ.CURRENT_PATCH, ...buildBody('gp50')] })
    const snapshot = await createGp5Sync('gp50').readState(link)
    expect(snapshot.slots.AMP.enabled).toBe(true)
    expect(link.sent).toHaveLength(1)
  })

  it('recusa o corpo de outro pedal', async () => {
    const link = mockLink({ [READ.CURRENT_PATCH]: [0x12, READ.CURRENT_PATCH, ...buildBody('gp50')] })
    await expect(createGp5Sync('gp5').readState(link)).rejects.toThrow(/GP-5/)
  })
})

describe('perfis', () => {
  it('detecta o pedal pelo nome da porta, sem confundir GP-5 com GP-50 ou GP-150', () => {
    const detect = (port: string) => [gp5Profile, gp50Profile].find((p: DeviceProfile) => p.portHint.test(port))?.id
    expect(detect('GP-5 MIDI 1')).toBe('gp5')
    expect(detect('GP-50 MIDI 1')).toBe('gp50')
    expect(detect('Valeton GP-50')).toBe('gp50')
    expect(detect('GP-150 MIDI 1')).toBeUndefined()
    expect(detect('Valeton GP-150')).toBeUndefined()
    expect(detect('Valeton GP-200 MIDI')).toBeUndefined()
  })

  it('cada slot do catálogo tem efeitos e parâmetros consistentes', () => {
    for (const profile of [gp5Profile, gp50Profile]) {
      for (const slot of profile.slots) {
        const effects = profile.getEffects(slot.id)
        expect(effects?.length, `${profile.id} ${slot.id}`).toBeGreaterThan(0)
        expect(new Set(effects!.map((e) => e.effectCode)).size).toBe(effects!.length)
        for (const effect of effects!) {
          for (const p of effect.parameters) {
            expect(p.index).toBeGreaterThanOrEqual(0)
            expect(p.index).toBeLessThan(8)
            if (p.type === 'slider') expect(p.default as number).toBeGreaterThanOrEqual(p.min!)
          }
        }
      }
    }
  })

  it('o GP-50 tem modelos que o GP-5 não tem e nenhum dos dois expõe o Sync', () => {
    const names = (p: typeof gp5Profile, slot: string) => p.getEffects(slot)!.map((e) => e.name)
    expect(names(gp50Profile, 'PRE')).toContain('AC Sim')
    expect(names(gp5Profile, 'PRE')).not.toContain('AC Sim')
    for (const p of [gp5Profile, gp50Profile]) {
      for (const e of p.getEffects('DLY')!) expect(e.parameters.map((x) => x.name)).not.toContain('Sync')
    }
  })

  it('NS lista os 80 SnapTones e aceita nomes lidos do pedal', () => {
    expect(gp5Profile.getEffects('NS')).toHaveLength(80)
    gp5Profile.setEffectNames?.({ NS: { 0x0f000032: 'Meu Amp' } })
    expect(gp5Profile.findEffect('NS', 0x0f000032)?.name).toBe('Meu Amp')
    gp5Profile.setEffectNames?.({})
    expect(gp5Profile.findEffect('NS', 0x0f000032)?.name).toBe('SnapTone 50')
  })

  it('o GP-5 seleciona preset por CC e o GP-50 por SysEx', () => {
    expect(Array.from(gp5Profile.commands.selectPreset(3, 'midi')[0])).toEqual([0xb0, 0, 2])
    expect(gp50Profile.commands.selectPreset(3, 'midi')[0][0]).toBe(0xf0)
  })

  it('o GP-5 rotula os presets de 00 a 99', () => {
    expect([1, 2, 100].map((n) => gp5Profile.presetLabel!(n))).toEqual(['00', '01', '99'])
    expect([1, 100].map((n) => gp50Profile.presetLabel!(n))).toEqual(['01', '100'])
  })

  it('o VOL é o volume do preset: sempre ligado, fixo e sem comandos de bloco', () => {
    expect(gp5Profile.slots[gp5Profile.slots.length - 1].id).toBe('VOL')
    expect(gp5Profile.alwaysOnSlots).toEqual(['VOL'])
    expect(gp5Profile.commands.toggleSlot('VOL', false, 'midi')).toEqual([])
    const [frame] = gp5Profile.commands.setParameter('VOL', { effectCode: 1, extra17: 0 }, 0, 70, 'midi')
    expect(parseSysex(frame)!.payload.slice(1, 10)).toEqual(Uint8Array.from([0x42, 0x01, 0x20, 0, 0, 70, 0, 0, 0]))
  })

  it('escolher um efeito troca o modelo e liga o bloco', () => {
    const effect = gp5Profile.getEffects('DST')![0]
    const frames = gp5Profile.commands.selectEffect('DST', effect, { effectCode: null, extra17: 0 }, 'midi')
    expect(frames.map((f) => parseSysex(f)!.payload[1])).toEqual([0x47, 0x49])
  })
})
