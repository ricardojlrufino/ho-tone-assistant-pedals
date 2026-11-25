import type { DeviceSnapshot, DeviceSync, MidiLink } from '../../../sdk/types'
import { buildReadRequest } from './protocol/commands'
import { KIND, READ, type Gp5Device } from './protocol/constants'
import { Reassembler, parseSysex } from './protocol/frame'
import { decodePatchBody, deviceByBodyLength, patchBodyToSnapshot } from './protocol/patch'

const REPLY_TIMEOUT_MS = 2500
const NAMES_TIMEOUT_MS = 4000
const RETRIES = 1
/** Folga depois de cada leitura: o pedal ignora pedidos colados (Valeton Suite espera 200 ms). */
const SETTLE_MS = 200

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Manda a leitura `sel` e junta o payload da resposta (que começa com o eco `[0x12, sel]`). Respostas longas
 * (nomes dos presets, corpo do preset) chegam em vários frames; frames com CRC ou tamanho errado são descartados.
 */
function readReply(link: MidiLink, sel: number, timeoutMs: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reassembler = new Reassembler()
    const finish = (done: () => void) => {
      unsubscribe()
      clearTimeout(timer)
      done()
    }
    const unsubscribe = link.subscribe((message) => {
      const frame = parseSysex(message)
      if (!frame || !frame.crcOk || !frame.lenOk) return
      const payload = reassembler.push(frame)
      if (payload && payload[0] === KIND.GET && payload[1] === sel && payload.length > 2) finish(() => resolve(payload))
    })
    const timer = setTimeout(() => finish(() => reject(new Error('Sem resposta do pedal'))), timeoutMs)
    for (const frame of buildReadRequest(sel)) link.send(frame)
  })
}

async function read(link: MidiLink, sel: number, timeoutMs = REPLY_TIMEOUT_MS): Promise<Uint8Array> {
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await readReply(link, sel, timeoutMs)
      } catch (err) {
        if (attempt >= RETRIES) throw err
        await sleep(400)
      }
    }
  } finally {
    await sleep(SETTLE_MS)
  }
}

const latin1 = (bytes: Uint8Array) => {
  let text = ''
  for (const c of bytes) {
    if (c === 0) break
    text += String.fromCharCode(c)
  }
  return text.trim()
}

/** 0x40 → nomes dos 100 presets na ordem do slot: por entrada, `u32 id` + nome de 16 bytes. */
export function decodePresetNames(data: Uint8Array): string[] {
  const names: string[] = []
  for (let offset = 2; offset + 20 <= data.length; offset += 20) names.push(latin1(data.subarray(offset + 4, offset + 20)))
  return names
}

/**
 * 0x24 (80 SnapTones: 0-49 de fábrica, 50-79 de usuário) → nome de cada slot. Os slots sem conteúdo se chamam
 * "Empty"; ficam de fora e valem os nomes padrão do catálogo.
 */
export function decodeSnapToneNames(data: Uint8Array, firstFxid: number): Record<number, string> {
  const count = 80
  const names: Record<number, string> = {}
  for (let i = 0; i < count && 2 + count + i * 16 + 16 <= data.length; i++) {
    const name = latin1(data.subarray(2 + count + i * 16, 2 + count + i * 16 + 16))
    if (name && name !== 'Empty') names[firstFxid + i] = name
  }
  return names
}

/** 0x20 (20 IRs de usuário) → nome de cada slot carregado; os vazios ("User IR n") ficam com o nome do catálogo. */
export function decodeUserIrNames(data: Uint8Array, firstFxid: number): Record<number, string> {
  const count = 20
  const names: Record<number, string> = {}
  for (let i = 0; i < count && 2 + count + i * 16 + 16 <= data.length; i++) {
    const loaded = data[2 + i] === 0
    const name = latin1(data.subarray(2 + count + i * 16, 2 + count + i * 16 + 16))
    if (loaded && name) names[firstFxid + i] = name
  }
  return names
}

const FIRST_SNAPTONE_FXID = 0x0f000000
const FIRST_USER_IR_FXID = 0x0a100000

/** Leitura do estado do GP-5 (`gp5`) ou do GP-50 (`gp50`) pelo enlace MIDI. */
export function createGp5Sync(device: Gp5Device): DeviceSync {
  return {
    readState: async (link): Promise<DeviceSnapshot> => {
      const reply = await read(link, READ.CURRENT_PATCH)
      const body = reply.slice(2)
      const detected = deviceByBodyLength(body.length)
      if (detected !== device) {
        throw new Error(`O corpo do preset tem ${body.length} bytes, que não é de um ${device === 'gp5' ? 'GP-5' : 'GP-50'}. Escolha o pedal certo.`)
      }
      return patchBodyToSnapshot(decodePatchBody(body))
    },
    readPresetNames: async (link) => decodePresetNames(await read(link, READ.PRESET_NAMES, NAMES_TIMEOUT_MS)),
    readUserEffectNames: async (link) => {
      const snapTones = decodeSnapToneNames(await read(link, READ.SNAPTONES), FIRST_SNAPTONE_FXID)
      const irs = decodeUserIrNames(await read(link, READ.USER_IRS), FIRST_USER_IR_FXID)
      return { NS: snapTones, CAB: irs }
    },
    // A resposta (`12 43 <slot>`) chega como evento `preset` em `parseIncoming`.
    requestCurrentPreset: (link) => {
      for (const frame of buildReadRequest(READ.CURRENT_SLOT)) link.send(frame)
    },
    // Só o GP-50 sabe dizer se o preset ativo foi editado (leitura 0x45); a resposta não é mapeada em evento ainda.
    requestModifiedStatus: () => {},
    resyncOnEffectChange: true,
  }
}
