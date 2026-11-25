import type { DeviceSnapshot } from '../../../../sdk/types'
import { BLOCK_COUNT, BODY_LENGTH, PARAMS_PER_BLOCK, SLOTS, VOLUME_EFFECT_CODE, VOLUME_SLOT_ID, type Gp5Device } from './constants'

/**
 * Corpo do preset ativo (resposta da leitura 0x41; é o `.prst` a partir do byte 0x29). Uma cadeia de registros
 * `[u16 tag][u16 tamanho][dados]`:
 *   0x0001 ajustes: entradas de tag `0x20nn` — nn=1 volume, nn=2 BPM (int32; no GP-50 o volume é 1 byte)
 *   0x0002 tom (390 bytes): sub-registros de tag `0x30nn` —
 *          1 máscara de liga/desliga (u32), 2 ordem (10 bytes), 3 modelos (10 x u32 fxid), 4 parâmetros (80 x float32)
 */
export interface PatchBody {
  volume: number | null
  bpm: number | null
  /** Bit k = bloco k (índice de armazenamento) ligado. */
  enableMask: number
  /** Blocos (índice de armazenamento) do primeiro ao último da cadeia. */
  order: number[]
  fxids: number[]
  /** `params[block * 8 + algId]`. */
  params: number[]
}

const TONE_TAG = 0x0002
const SETTINGS_TAG = 0x0001
const SETTING = { VOLUME: 0x2001, BPM: 0x2002 } as const
const TONE = { MASK: 0x3001, ORDER: 0x3002, MODELS: 0x3003, PARAMS: 0x3004 } as const

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const dataView = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength)

/** Qual pedal devolveu um corpo de `length` bytes; `null` se não bate com nenhum. */
export function deviceByBodyLength(length: number): Gp5Device | null {
  return (Object.keys(BODY_LENGTH) as Gp5Device[]).find((d) => BODY_LENGTH[d] === length) ?? null
}

/** Percorre registros `[u16 tag][u16 tamanho][dados]`; `data` é uma janela dentro de `bytes`. */
function* records(bytes: Uint8Array): Generator<{ tag: number; data: Uint8Array }> {
  for (let o = 0; o + 4 <= bytes.length; ) {
    const length = u16(bytes, o + 2)
    if (o + 4 + length > bytes.length) throw new Error('Registro do preset ultrapassa o corpo lido')
    yield { tag: u16(bytes, o), data: bytes.subarray(o + 4, o + 4 + length) }
    o += 4 + length
  }
}

export function decodePatchBody(body: Uint8Array): PatchBody {
  let tone: Uint8Array | null = null
  let volume: number | null = null
  let bpm: number | null = null
  for (const { tag, data } of records(body)) {
    if (tag === TONE_TAG) tone = data
    else if (tag === SETTINGS_TAG) {
      for (const entry of records(data)) {
        const value = entry.data.length === 4 ? dataView(entry.data).getInt32(0, true) : entry.data[0]
        if (entry.tag === SETTING.VOLUME) volume = value
        else if (entry.tag === SETTING.BPM) bpm = value
      }
    }
  }
  if (!tone) throw new Error('Preset sem o registro de tom (0x0002)')

  let enableMask: number | null = null
  let order: number[] | null = null
  let fxids: number[] | null = null
  let params: number[] | null = null
  for (const { tag, data } of records(tone)) {
    const view = dataView(data)
    if (tag === TONE.MASK && data.length === 4) enableMask = view.getUint32(0, true)
    else if (tag === TONE.ORDER && data.length === BLOCK_COUNT) order = Array.from(data)
    else if (tag === TONE.MODELS && data.length === BLOCK_COUNT * 4) {
      fxids = Array.from({ length: BLOCK_COUNT }, (_, k) => view.getUint32(k * 4, true))
    } else if (tag === TONE.PARAMS && data.length === BLOCK_COUNT * PARAMS_PER_BLOCK * 4) {
      params = Array.from({ length: BLOCK_COUNT * PARAMS_PER_BLOCK }, (_, i) => view.getFloat32(i * 4, true))
    }
  }
  if (enableMask === null || !order || !fxids || !params) throw new Error('Registro de tom incompleto')
  return { volume, bpm, enableMask, order, fxids, params }
}

/** Valor do float32 sem o ruído da conversão (0.1 vira 0.1, não 0.10000000149). */
const clean = (v: number) => Math.round(v * 10000) / 10000

/** Corpo lido → estado que o app aplica na cadeia. `chainOrder` é indexado pela posição do slot em `SLOTS`. */
export function patchBodyToSnapshot(body: PatchBody): DeviceSnapshot {
  const slots: DeviceSnapshot['slots'] = {}
  for (const slot of SLOTS) {
    const parameters: Record<number, number> = {}
    for (let i = 0; i < PARAMS_PER_BLOCK; i++) parameters[i] = clean(body.params[slot.block * PARAMS_PER_BLOCK + i])
    slots[slot.id] = {
      enabled: (body.enableMask & (1 << slot.block)) !== 0,
      effectCode: body.fxids[slot.block],
      parameters,
    }
  }
  // O volume do preset vira o bloco VOL: sempre ligado e na última posição da cadeia.
  slots[VOLUME_SLOT_ID] = { enabled: true, effectCode: VOLUME_EFFECT_CODE, parameters: body.volume == null ? {} : { 0: body.volume } }
  const positions = SLOTS.map((slot) => body.order.indexOf(slot.block))
  const valid = positions.every((p) => p >= 0)
  return { slots, chainOrder: [...(valid ? positions : SLOTS.map((_, i) => i)), SLOTS.length], presetVolume: body.volume }
}
