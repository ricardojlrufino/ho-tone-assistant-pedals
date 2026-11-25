/**
 * USB-MIDI Event Packets (classe de áudio, MIDI Streaming): blocos de 4 bytes `[cable<<4 | CIN, b1, b2, b3]`.
 * O SysEx vem repartido em vários blocos, que `SysexAssembler` junta de volta em `F0 ... F7`.
 */

/** Bytes válidos de cada CIN (Code Index Number); 0 e 1 são reservados. */
const CIN_LENGTH: Record<number, number> = { 2: 2, 3: 3, 4: 3, 5: 1, 6: 2, 7: 3, 8: 3, 9: 3, 10: 3, 11: 3, 12: 2, 13: 2, 14: 3, 15: 1 }

export interface UsbMidiMessage {
  kind: 'sysex' | 'midi'
  cable: number
  bytes: number[]
}

/** Parece um fluxo USB-MIDI? (múltiplo de 4 e todo bloco com um CIN válido; blocos zerados são preenchimento.) */
export function looksLikeUsbMidi(data: Uint8Array): boolean {
  if (data.length === 0 || data.length % 4 !== 0) return false
  let real = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 0) continue
    if (!((data[i] & 0x0f) in CIN_LENGTH)) return false
    real++
  }
  return real > 0
}

/** Um montador por (dispositivo, endpoint): o SysEx de um sentido não se mistura com o do outro. */
export class SysexAssembler {
  private buffer: number[] | null = null

  push(data: Uint8Array): UsbMidiMessage[] {
    const out: UsbMidiMessage[] = []
    for (let i = 0; i + 4 <= data.length; i += 4) {
      const cable = data[i] >> 4
      const cin = data[i] & 0x0f
      const length = CIN_LENGTH[cin]
      if (length === undefined) continue
      const body = Array.from(data.subarray(i + 1, i + 1 + length))
      if (cin === 4) {
        if (body[0] === 0xf0) this.buffer = []
        this.buffer?.push(...body)
      } else if (cin >= 5 && cin <= 7 && (this.buffer || body[0] === 0xf0)) {
        const bytes = [...(this.buffer ?? []), ...body]
        this.buffer = null
        out.push({ kind: 'sysex', cable, bytes })
      } else {
        out.push({ kind: 'midi', cable, bytes: body })
      }
    }
    return out
  }
}

/** Monta os blocos USB-MIDI de uma mensagem SysEx completa (útil para os testes). */
export function encodeSysex(frame: ArrayLike<number>, cable = 0): Uint8Array {
  const bytes = Array.from(frame)
  const out: number[] = []
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = bytes.slice(i, i + 3)
    const last = i + 3 >= bytes.length
    const cin = last ? (chunk.length === 1 ? 5 : chunk.length === 2 ? 6 : 7) : 4
    out.push((cable << 4) | cin, chunk[0], chunk[1] ?? 0, chunk[2] ?? 0)
  }
  return Uint8Array.from(out)
}
