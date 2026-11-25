import { encodeSysex } from './usbmidi'
import { tsharkText, usbpcapFrame } from './fixtures'

/**
 * `bun scripts/capture/demo.ts | bun scripts/capture/live.ts demo` — um pedal de mentira: manda um aviso de repouso a cada
 * segundo e responde a cada comando "liga/desliga" que aparece a cada 4 s. Serve para treinar o roteiro antes de ligar o pedal real.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
let n = 0
for (;;) {
  const now = Date.now() / 1000
  const packets = [{ time: now, bytes: usbpcapFrame({ endpoint: 0x81, data: encodeSysex([0xf0, 0x7d, 0x00, 0xf7]) }) }]
  if (n >= 5 && n % 4 === 3) packets.push({ time: now + 0.01, bytes: usbpcapFrame({ endpoint: 0x01, data: encodeSysex([0xf0, 0x7d, 0x01, 0x02, (n >> 2) & 1, 0xf7]) }) })
  process.stdout.write(tsharkText(packets) + '\n')
  n++
  await sleep(1000)
}
