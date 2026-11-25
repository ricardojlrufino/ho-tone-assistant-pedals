/**
 * Enquadramento SysEx do GP-5 e do GP-50 (mesmo nos dois sentidos):
 *   BUF  = [crc, total, index, len, ...payload]   (payload <= 19 bytes por frame)
 *   crc  = CRC-8 (poly 0x07, init 0, sem reflexão) sobre BUF[1..]
 *   wire = F0, cada byte de BUF em dois nibbles (alto primeiro), F7
 * `total` é o número de frames da transferência e `index` vai de 0 a total-1.
 */

export const FRAME_PAYLOAD_MAX = 19

/** CRC-8/SMBUS: crc8("123456789") === 0xF4. */
export function crc8(bytes: ArrayLike<number>): number {
  let crc = 0
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff
  }
  return crc
}

function buildFrame(total: number, index: number, payload: ArrayLike<number>): number[] {
  const buf = [0, total & 0xff, index & 0xff, payload.length, ...Array.from(payload)]
  buf[0] = crc8(buf.slice(1))
  return buf
}

function frameToSysex(buf: number[]): Uint8Array {
  const out = new Uint8Array(buf.length * 2 + 2)
  out[0] = 0xf0
  buf.forEach((b, i) => {
    out[1 + i * 2] = b >> 4
    out[2 + i * 2] = b & 0x0f
  })
  out[out.length - 1] = 0xf7
  return out
}

/** Divide um payload lógico em mensagens SysEx prontas para enviar. */
export function packetize(payload: ArrayLike<number>): Uint8Array[] {
  const bytes = Array.from(payload)
  const total = Math.max(1, Math.ceil(bytes.length / FRAME_PAYLOAD_MAX))
  if (total > 0xff) throw new RangeError('O payload precisa de mais de 255 frames')
  return Array.from({ length: total }, (_, i) =>
    frameToSysex(buildFrame(total, i, bytes.slice(i * FRAME_PAYLOAD_MAX, (i + 1) * FRAME_PAYLOAD_MAX))),
  )
}

export interface Frame {
  crcOk: boolean
  total: number
  index: number
  lenOk: boolean
  payload: Uint8Array
}

/** Decodifica uma mensagem SysEx (com ou sem F0/F7); `null` se não for um frame nibble da Valeton. */
export function parseSysex(message: ArrayLike<number>): Frame | null {
  let start = 0
  let end = message.length
  if (message[0] === 0xf0) start = 1
  if (message[end - 1] === 0xf7) end -= 1
  const nibbles = end - start
  if (nibbles < 8 || nibbles % 2) return null
  const buf = new Uint8Array(nibbles / 2)
  for (let i = 0; i < buf.length; i++) {
    const hi = message[start + 2 * i]
    const lo = message[start + 2 * i + 1]
    if (hi > 0x0f || lo > 0x0f) return null
    buf[i] = (hi << 4) | lo
  }
  const payload = buf.subarray(4)
  return { crcOk: buf[0] === crc8(buf.subarray(1)), total: buf[1], index: buf[2], lenOk: buf[3] === payload.length, payload }
}

/** Junta as transferências de vários frames: agrupa por `total`, ordena por `index`. */
export class Reassembler {
  private pending = new Map<number, { parts: (Uint8Array | undefined)[]; have: number }>()

  /** Devolve o payload completo quando o último frame que faltava chega; senão `null`. */
  push(frame: Frame): Uint8Array | null {
    if (frame.total <= 1) return frame.payload.slice()
    if (frame.index >= frame.total) return null
    let transfer = this.pending.get(frame.total)
    if (!transfer || (frame.index === 0 && transfer.parts[0])) {
      transfer = { parts: new Array<Uint8Array | undefined>(frame.total), have: 0 }
      this.pending.set(frame.total, transfer)
    }
    if (!transfer.parts[frame.index]) transfer.have++
    transfer.parts[frame.index] = frame.payload.slice()
    if (transfer.have < frame.total) return null
    this.pending.delete(frame.total)
    const parts = transfer.parts as Uint8Array[]
    const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
    let offset = 0
    for (const part of parts) {
      out.set(part, offset)
      offset += part.length
    }
    return out
  }
}
