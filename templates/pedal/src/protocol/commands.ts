import type { DeviceEvent } from '../../../../sdk/types'
import { CMD, MAX_PRESET, MIN_PRESET, slotIndex } from './constants'
import { buildFrame, encode14, parseFrame } from './frame'

/** Cada função devolve os frames a enviar, em ordem. */

export function buildToggle(slotId: string, enabled: boolean): Uint8Array[] {
  return [buildFrame(CMD.TOGGLE, [slotIndex(slotId), enabled ? 1 : 0])]
}

export function buildSelectPreset(preset: number): Uint8Array[] {
  if (!Number.isInteger(preset) || preset < MIN_PRESET || preset > MAX_PRESET) throw new RangeError(`Preset deve ser ${MIN_PRESET}..${MAX_PRESET}, recebido ${preset}`)
  return [buildFrame(CMD.SELECT_PRESET, [preset - MIN_PRESET])]
}

/** `effectCode` é o número do efeito no catálogo (`src/data/effects.json`). */
export function buildSelectEffect(slotId: string, effectCode: number): Uint8Array[] {
  return [buildFrame(CMD.SELECT_EFFECT, [slotIndex(slotId), effectCode])]
}

/** `paramIndex` é o `index` do parâmetro no catálogo; `value` é o valor cru (o mesmo que o catálogo declara em min/max). */
export function buildSetParameter(slotId: string, paramIndex: number, value: number): Uint8Array[] {
  return [buildFrame(CMD.SET_PARAMETER, [slotIndex(slotId), paramIndex, ...encode14(Math.round(value))])]
}

export const buildRequestState = (): Uint8Array[] => [buildFrame(CMD.REQUEST_STATE)]

/**
 * Chave de coalescência: comandos de parâmetro na fila para o mesmo botão se substituem (só o último vale),
 * o que evita encher a fila quando o usuário arrasta um slider. `null` = nunca coalescer.
 */
export function coalesceKey(frame: Uint8Array): string | null {
  const parsed = parseFrame(frame)
  if (!parsed || parsed.cmd !== CMD.SET_PARAMETER) return null
  return `param:${parsed.data[0]}:${parsed.data[1]}`
}

/** Mudanças feitas no próprio pedal (footswitch, knob) que o app deve refletir na tela. */
export function parseIncoming(message: ArrayLike<number>): DeviceEvent | null {
  const frame = parseFrame(message)
  if (!frame) return null
  if (frame.cmd === CMD.PRESET_CHANGED) return { type: 'preset', preset: frame.data[0] + MIN_PRESET }
  return null
}
