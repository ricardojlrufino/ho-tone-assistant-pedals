import type { DeviceEvent } from '../../../../sdk/types'
import { packetize, parseSysex } from './frame'
import {
  BLOCK_COUNT,
  CMD,
  KIND,
  MAX_PRESET,
  MIN_PRESET,
  PARAMS_PER_BLOCK,
  PATCH_VOLUME_RECORD,
  PRESET_NAME_LENGTH,
  READ,
  SLOTS,
  VOLUME_SLOT_ID,
  isForbiddenFn,
} from './constants'

const u32le = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]

function f32le(v: number): number[] {
  const view = new DataView(new ArrayBuffer(4))
  view.setFloat32(0, v, true)
  return [0, 1, 2, 3].map((i) => view.getUint8(i))
}

const readU32 = (b: ArrayLike<number>, o: number) => ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0)
const readI32 = (b: ArrayLike<number>, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)
const readS16 = (b: ArrayLike<number>, o: number) => ((b[o] | (b[o + 1] << 8)) << 16) >> 16

function readF32(b: ArrayLike<number>, o: number): number {
  const view = new DataView(new ArrayBuffer(4))
  for (let i = 0; i < 4; i++) view.setUint8(i, b[o + i])
  return view.getFloat32(0, true)
}

function checkBlock(block: number) {
  if (!Number.isInteger(block) || block < 0 || block >= BLOCK_COUNT) throw new RangeError(`Bloco desconhecido: ${block}`)
}

/** Slot do preset (0-based) a partir do número 1-based do app. */
function presetSlot(preset: number): number {
  if (!Number.isInteger(preset) || preset < MIN_PRESET || preset > MAX_PRESET) {
    throw new RangeError(`Preset deve ser ${MIN_PRESET}..${MAX_PRESET}, recebido ${preset}`)
  }
  return preset - MIN_PRESET
}

/** Frames de um comando: nunca emite uma função que o pedal não pode receber. */
function frames(payload: number[]): Uint8Array[] {
  if (isForbiddenFn(payload[1])) throw new Error(`Função 0x${payload[1].toString(16)} é proibida`)
  return packetize(payload)
}

/** Nome ASCII imprimível de até 10 caracteres, preenchido com zeros. */
function nameField(name: string): number[] {
  const text = Array.from(name)
    .filter((c) => c >= ' ' && c <= '~')
    .join('')
    .slice(0, PRESET_NAME_LENGTH)
  return Array.from({ length: PRESET_NAME_LENGTH }, (_, i) => (i < text.length ? text.charCodeAt(i) : 0))
}

/** Pedido de leitura (`[0x12, sel]`). */
export const buildReadRequest = (sel: number) => frames([KIND.GET, sel])

/** Seleciona o preset por SysEx — é o que o Valeton Suite faz no GP-50. */
export const buildSelectPresetSysex = (preset: number) => frames([KIND.SET, CMD.SELECT_PRESET, ...u32le(presetSlot(preset))])

/** Seleciona o preset por Control Change #0 (canal 1) — o que funciona no GP-5, que ignora Program Change. */
export const buildSelectPresetCc = (preset: number) => [Uint8Array.from([0xb0, 0x00, presetSlot(preset)])]

export const buildToggle = (block: number, enabled: boolean) => {
  checkBlock(block)
  return frames([KIND.SET, CMD.SET_BLOCK, ...u32le(block), ...u32le(enabled ? 1 : 0)])
}

/** Troca o modelo do bloco; o pedal carrega os parâmetros padrão do modelo novo. `fxid` = (categoria << 24) | modelo. */
export const buildSelectModel = (block: number, fxid: number) => {
  checkBlock(block)
  return frames([KIND.SET, CMD.SET_MODEL, ...u32le(block), ...u32le(block), ...u32le(fxid >>> 0)])
}

/** Ajusta um parâmetro (`algId` 0..7) com o valor na unidade de exibição, como float32. */
export const buildSetParameter = (block: number, paramIndex: number, value: number) => {
  checkBlock(block)
  if (!Number.isInteger(paramIndex) || paramIndex < 0 || paramIndex >= PARAMS_PER_BLOCK) {
    throw new RangeError(`Parâmetro inválido: ${paramIndex}`)
  }
  return frames([KIND.SET, CMD.SET_PARAM, ...u32le(block), ...u32le(paramIndex), ...f32le(value)])
}

/** Volume do preset ativo (0-100). */
export const buildPresetVolume = (volume: number) =>
  frames([KIND.SET, CMD.PATCH_SETTING, ...u32le(PATCH_VOLUME_RECORD), ...u32le(Math.max(0, Math.min(100, Math.round(volume))))])

/** Grava o buffer editado no preset `preset` (1-based) com `name` — sobrescreve o preset. */
export const buildSavePreset = (preset: number, name: string) =>
  frames([KIND.SET, CMD.SAVE_PRESET, ...u32le(presetSlot(preset)), ...nameField(name)])

/** Mesmo parâmetro girado várias vezes na fila de envio: só o último valor importa. */
export function coalesceKey(frame: Uint8Array): string | null {
  const parsed = parseSysex(frame)
  if (!parsed || parsed.total !== 1) return null
  const p = parsed.payload
  return p[0] === KIND.SET && p[1] === CMD.SET_PARAM && p.length >= 10 ? `param:${readU32(p, 2)}:${readU32(p, 6)}` : null
}

const SLOT_BY_BLOCK = new Map(SLOTS.map((s, index) => [s.block, { slot: s, index }]))

/**
 * Interpreta uma mensagem SysEx que o pedal mandou sozinho (botão, footswitch, eco de comando) e devolve o evento
 * correspondente. Só mensagens de um frame: as respostas longas (nomes, dump) são lidas pelo `sync`.
 */
export function parseGp5Message(data: ArrayLike<number>): DeviceEvent | null {
  const frame = parseSysex(data)
  if (!frame || !frame.crcOk || !frame.lenOk || frame.total !== 1) return null
  const p = frame.payload
  const kind = p[0]
  const fn = p[1]
  if (kind === KIND.GET && fn === READ.CURRENT_SLOT && p.length >= 3) {
    return { type: 'preset', preset: ((p[2] | ((p[3] ?? 0) << 8)) + MIN_PRESET) }
  }
  if (kind !== KIND.SET && kind !== KIND.GET) return null
  const slotOf = (block: number) => SLOT_BY_BLOCK.get(block)?.slot.id
  switch (fn) {
    case CMD.SET_PARAM: {
      const slotId = p.length >= 14 ? slotOf(readU32(p, 2)) : undefined
      return slotId ? { type: 'parameter', slotId, paramIndex: readU32(p, 6), value: readF32(p, 10) } : null
    }
    case CMD.SET_BLOCK: {
      const slotId = p.length >= 10 ? slotOf(readU32(p, 2)) : undefined
      return slotId ? { type: 'toggle', slotId, enabled: readU32(p, 6) !== 0 } : null
    }
    case CMD.SET_MODEL: {
      // GP-5: u32 bloco, u32 bloco, u32 fxid. Eco do GP-50: s16 bloco, s16 bloco, u32 fxid (10 bytes).
      if (p.length >= 14) {
        const slotId = slotOf(readU32(p, 2))
        return slotId ? { type: 'effect', slotId, effectCode: readU32(p, 10) } : null
      }
      const slotId = p.length === 10 ? slotOf(readS16(p, 2)) : undefined
      return slotId ? { type: 'effect', slotId, effectCode: readU32(p, 6) } : null
    }
    case CMD.SET_ORDER: {
      if (p.length < 12) return null
      const moduleIds = Array.from({ length: BLOCK_COUNT }, (_, i) => SLOT_BY_BLOCK.get(p[2 + i])?.index ?? -1)
      return moduleIds.every((id) => id >= 0) && new Set(moduleIds).size === BLOCK_COUNT ? { type: 'chain', moduleIds } : null
    }
    case CMD.PATCH_SETTING: {
      // Dois formatos de 10 bytes ([u16 registro][u16 tamanho][valor] e [u32 registro][u32 valor]); o valor fica em 6.
      if (p.length < 7 || (p[2] | (p[3] << 8)) !== PATCH_VOLUME_RECORD) return null
      return { type: 'parameter', slotId: VOLUME_SLOT_ID, paramIndex: 0, value: p.length >= 10 ? readI32(p, 6) : p[6] }
    }
    default:
      return null
  }
}
