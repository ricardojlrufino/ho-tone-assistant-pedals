/**
 * Leitura da saída `tshark -x` (hexdump de cada pacote) de uma captura USBPcap, que é o que o Windows tem.
 * Lê os bytes do próprio pacote em vez dos campos que o Wireshark decodifica, porque o campo muda conforme o dissector
 * assume (USB Audio, HID, dados soltos) e o cabeçalho do USBPcap é fixo.
 */

export interface UsbPacket {
  /** Segundos desde 1970 (`tshark -t e`). */
  time: number
  device: number
  endpoint: number
  /** `in` = pedal → computador. */
  dir: 'in' | 'out'
  transfer: 'iso' | 'interrupt' | 'control' | 'bulk' | 'unknown'
  data: Uint8Array
}

const TRANSFER = ['iso', 'interrupt', 'control', 'bulk'] as const

/** Cabeçalho do USBPcap: headerLen u16 | irpId u64 | status u32 | function u16 | info u8 | bus u16 | device u16 | endpoint u8 | transfer u8 | dataLength u32. */
export function parseUsbpcap(frame: Uint8Array, time: number): UsbPacket | null {
  if (frame.length < 27) return null
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const headerLen = view.getUint16(0, true)
  if (headerLen < 27 || headerLen > frame.length) return null
  const endpoint = frame[21]
  return {
    time,
    device: view.getUint16(19, true),
    endpoint: endpoint & 0x7f,
    dir: endpoint & 0x80 ? 'in' : 'out',
    transfer: TRANSFER[frame[22]] ?? 'unknown',
    data: frame.subarray(headerLen),
  }
}

/** Remonta os pacotes a partir das linhas do `tshark -x -t e`: uma linha-resumo, o hexdump e uma linha em branco. */
export class HexdumpParser {
  private time = 0
  private bytes: number[] = []

  /** Devolve o pacote quando ele termina (linha em branco, ou o início do próximo). */
  push(line: string): { time: number; bytes: Uint8Array } | null {
    // Primeiro o hexdump: "0010  00 00 ..." também casaria com o padrão da linha-resumo ("número espaço número").
    if (/^[0-9a-f]{4}  [0-9a-f]{2} /i.test(line)) {
      // 16 bytes por linha, com um espaço extra no meio; o que vem depois da coluna 55 é o texto ASCII.
      for (const pair of line.slice(6, 55).match(/\b[0-9a-f]{2}\b/gi) ?? []) this.bytes.push(parseInt(pair, 16))
      return null
    }
    const summary = /^\s*\d+\s+(\d+(?:\.\d+)?)\s/.exec(line)
    if (summary) {
      const done = this.take()
      this.time = Number(summary[1])
      return done
    }
    return line.trim() === '' ? this.take() : null
  }

  private take() {
    if (this.bytes.length === 0) return null
    const packet = { time: this.time, bytes: Uint8Array.from(this.bytes) }
    this.bytes = []
    return packet
  }
}
