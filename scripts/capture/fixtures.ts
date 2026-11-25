/** Capturas sintéticas no formato do `tshark -x -t e`, para os testes e para ensaiar o fluxo sem o pedal. */
/** Pacote USBPcap: cabeçalho de 27 bytes + dados. */
export function usbpcapFrame(opts: { device?: number; endpoint: number; transfer?: number; data: ArrayLike<number> }): number[] {
  const data = Array.from(opts.data)
  const header = new Uint8Array(27)
  const view = new DataView(header.buffer)
  view.setUint16(0, 27, true)
  view.setUint16(19, opts.device ?? 5, true)
  header[21] = opts.endpoint
  header[22] = opts.transfer ?? 3
  view.setUint32(23, data.length, true)
  return [...header, ...data]
}

/** Imita a saída de `tshark -x -t e`: linha-resumo, hexdump de 16 bytes por linha com ASCII, linha em branco. */
export function tsharkText(packets: { time: number; bytes: number[] }[]): string {
  return packets
    .map(({ time, bytes }, n) => {
      const lines = [`${String(n + 1).padStart(5)} ${time.toFixed(6)} host -> 5.1 USB ${bytes.length} URB_BULK`]
      for (let i = 0; i < bytes.length; i += 16) {
        const row = bytes.slice(i, i + 16)
        const hex = Array.from({ length: 16 }, (_, j) => (j < row.length ? row[j].toString(16).padStart(2, '0') : '  ')).join(' ')
        const spaced = `${hex.slice(0, 23)}  ${hex.slice(24)}`
        const ascii = row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')
        lines.push(`${i.toString(16).padStart(4, '0')}  ${spaced}   ${ascii}`)
      }
      return lines.join('\n') + '\n'
    })
    .join('\n')
}
