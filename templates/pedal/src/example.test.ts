import { describe, expect, it } from 'vitest'
import type { MidiLink } from '../../../sdk/types'
import { exampleProfile } from './index'
import { buildSetParameter, coalesceKey, parseIncoming } from './protocol/commands'
import { CMD, SLOTS } from './protocol/constants'
import { buildFrame, decode14, encode14, parseFrame } from './protocol/frame'
import { exampleSync } from './sync'

describe('frames', () => {
  it('monta e lê de volta, e recusa checksum errado', () => {
    const frame = buildFrame(CMD.TOGGLE, [1, 1])
    expect(parseFrame(frame)).toEqual({ cmd: CMD.TOGGLE, data: [1, 1] })
    const corrupted = Uint8Array.from(frame)
    corrupted[corrupted.length - 2] ^= 0x01
    expect(parseFrame(corrupted)).toBeNull()
  })

  it('valores de 14 bits ida e volta', () => {
    for (const v of [0, 1, 127, 128, 1000, 16383]) expect(decode14(...(encode14(v) as [number, number]))).toBe(v)
  })

  it('nunca emite um byte fora de 7 bits', () => {
    expect(() => buildFrame(CMD.TOGGLE, [200])).toThrow(/7 bits/)
  })
})

describe('comandos', () => {
  it('a chave de coalescência é a mesma para o mesmo botão e muda com o valor ignorado', () => {
    const [a] = buildSetParameter('AMP', 1, 10)
    const [b] = buildSetParameter('AMP', 1, 90)
    const [c] = buildSetParameter('AMP', 2, 90)
    expect(coalesceKey(a)).toBe(coalesceKey(b))
    expect(coalesceKey(a)).not.toBe(coalesceKey(c))
    expect(coalesceKey(buildFrame(CMD.TOGGLE, [0, 1]))).toBeNull()
  })

  it('o aviso de troca de preset vira evento (1-based)', () => {
    expect(parseIncoming(buildFrame(CMD.PRESET_CHANGED, [4]))).toEqual({ type: 'preset', preset: 5 })
    expect(parseIncoming(buildFrame(CMD.TOGGLE, [0, 1]))).toBeNull()
  })
})

describe('perfil', () => {
  it('todo slot tem efeitos, sem efeitos repetidos nem parâmetros repetidos', () => {
    for (const slot of exampleProfile.slots) {
      const effects = exampleProfile.getEffects(slot.id)!
      expect(effects.length, slot.id).toBeGreaterThan(0)
      expect(new Set(effects.map((e) => e.effectCode)).size).toBe(effects.length)
      for (const e of effects) expect(new Set(e.parameters.map((p) => p.index)).size).toBe(e.parameters.length)
    }
  })

  it('o hint da porta casa com o nome esperado', () => {
    expect(exampleProfile.portHint.test('Example Pedal MIDI 1')).toBe(true)
    expect(exampleProfile.portHint.test('Valeton GP-150')).toBe(false)
  })
})

/** Enlace simulado: responde ao pedido de estado com o payload montado pelo teste. */
function mockLink(reply: Uint8Array): MidiLink {
  const listeners = new Set<(frame: Uint8Array) => void>()
  return {
    kind: 'usb',
    name: 'mock',
    send: () => void setTimeout(() => listeners.forEach((l) => l(reply)), 0),
    subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
  }
}

describe('sync', () => {
  it('readState decodifica a resposta', async () => {
    const perSlot = [1, 1, ...[0, 10, 0, 20, 0, 30, 0, 40]]
    const data = [3, 80, ...SLOTS.flatMap(() => perSlot)]
    const snapshot = await exampleSync.readState(mockLink(buildFrame(CMD.STATE, data)))
    expect(snapshot.presetVolume).toBe(80)
    expect(snapshot.slots.AMP).toEqual({ enabled: true, effectCode: 1, parameters: { 0: 10, 1: 20, 2: 30, 3: 40 } })
  })
})
