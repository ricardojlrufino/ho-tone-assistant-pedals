import { MANUFACTURER, MODEL } from './constants'

/** Checksum deste pedal fictício: XOR de todos os bytes de dados, em 7 bits (SysEx só aceita bytes < 0x80). */
export function checksum(bytes: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < bytes.length; i++) sum ^= bytes[i]
  return sum & 0x7f
}

/** Monta `F0 manufacturer model cmd ...data checksum F7`. Os dados têm de caber em 7 bits. */
export function buildFrame(cmd: number, data: ArrayLike<number> = []): Uint8Array {
  const body = [cmd, ...Array.from(data)]
  for (const b of body) if (!Number.isInteger(b) || b < 0 || b > 0x7f) throw new RangeError(`Byte fora de 7 bits: ${b}`)
  return Uint8Array.from([0xf0, MANUFACTURER, MODEL, ...body, checksum(body), 0xf7])
}

export interface ParsedFrame {
  cmd: number
  data: number[]
}

/** Lê um frame recebido; `null` para qualquer coisa que não seja deste pedal ou que esteja corrompida. */
export function parseFrame(message: ArrayLike<number>): ParsedFrame | null {
  if (message.length < 6 || message[0] !== 0xf0 || message[message.length - 1] !== 0xf7) return null
  if (message[1] !== MANUFACTURER || message[2] !== MODEL) return null
  const body = Array.from(message).slice(3, -2)
  if (checksum(body) !== message[message.length - 2]) return null
  return { cmd: body[0], data: body.slice(1) }
}

/** Valor de 14 bits em dois bytes de 7 bits (mais significativo primeiro). */
export const encode14 = (value: number): number[] => [(value >> 7) & 0x7f, value & 0x7f]
export const decode14 = (msb: number, lsb: number): number => ((msb & 0x7f) << 7) | (lsb & 0x7f)
