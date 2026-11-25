import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type CaptureEvent =
  | { kind: 'sysex' | 'midi' | 'raw'; t: number; dir: 'in' | 'out'; device: number; endpoint: number; hex: string }
  | { kind: 'mark'; t: number; label: string }

export const IDLE_LABEL = '--'

export const sessionDir = (name: string) => join(fileURLToPath(new URL('../../captures', import.meta.url)), name)
export const eventsFile = (name: string) => join(sessionDir(name), 'events.jsonl')

export function appendEvent(name: string, event: CaptureEvent): void {
  mkdirSync(sessionDir(name), { recursive: true })
  appendFileSync(eventsFile(name), JSON.stringify(event) + '\n')
}

export function readEvents(name: string): CaptureEvent[] {
  const file = eventsFile(name)
  if (!existsSync(file)) throw new Error(`Sessão não encontrada: ${file}`)
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CaptureEvent)
}

export const hexToBytes = (hex: string): number[] => hex.split(' ').filter(Boolean).map((b) => parseInt(b, 16))
export const bytesToHex = (bytes: ArrayLike<number>): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
