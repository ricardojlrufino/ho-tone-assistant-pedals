import type { DeviceSnapshot, DeviceSync, MidiLink } from '../../../sdk/types'
import { buildRequestState } from './protocol/commands'
import { CMD, SLOTS } from './protocol/constants'
import { decode14, parseFrame } from './protocol/frame'

const REPLY_TIMEOUT_MS = 2500

/** Manda um pedido e espera o primeiro frame com o comando `expected`; rejeita no timeout. */
function request(link: MidiLink, frames: Uint8Array[], expected: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const unsubscribe = link.subscribe((message) => {
      const frame = parseFrame(message)
      if (frame?.cmd !== expected) return
      clearTimeout(timer)
      unsubscribe()
      resolve(frame.data)
    })
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error('Sem resposta do pedal'))
    }, REPLY_TIMEOUT_MS)
    for (const frame of frames) link.send(frame)
  })
}

/**
 * Formato fictício da resposta `STATE`: `[preset, volume, ...por slot: ligado, efeito, 4 × (msb, lsb)]`.
 * Troque pelo que o seu pedal devolve.
 */
export function decodeState(data: number[]): DeviceSnapshot {
  const PARAMS = 4
  const stride = 2 + PARAMS * 2
  const slots: DeviceSnapshot['slots'] = {}
  SLOTS.forEach((slot, i) => {
    const o = 2 + i * stride
    const parameters: Record<number, number> = {}
    for (let p = 0; p < PARAMS; p++) parameters[p] = decode14(data[o + 2 + p * 2], data[o + 3 + p * 2])
    slots[slot.id] = { enabled: data[o] === 1, effectCode: data[o + 1], parameters }
  })
  return {
    slots,
    // Pedal sem reordenação: a ordem é a de fábrica (posição de cada slot em `profile.slots`).
    chainOrder: SLOTS.map((_, i) => i),
    presetVolume: data[1],
  }
}

export const exampleSync: DeviceSync = {
  readState: async (link) => decodeState(await request(link, buildRequestState(), CMD.STATE)),
  // Este pedal não tem como listar os nomes; o app mostra só o número do preset.
  readPresetNames: async () => [],
  // O pedal avisa a troca de preset sozinho (`PRESET_CHANGED`), então não há o que perguntar.
  requestCurrentPreset: () => {},
  requestModifiedStatus: () => {},
}

