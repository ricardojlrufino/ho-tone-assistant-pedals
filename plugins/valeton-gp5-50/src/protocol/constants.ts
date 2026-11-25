/** Id de slot do GP-5/GP-50 — os mesmos ids de módulo do GP-150 (reusa ícones e prompts). */
export type SlotId = 'NR' | 'PRE' | 'DST' | 'NS' | 'AMP' | 'CAB' | 'EQ' | 'MOD' | 'DLY' | 'RVB'

export type Gp5Device = 'gp5' | 'gp50'

export interface SlotDef {
  id: SlotId
  label: string
  /** Índice do bloco no armazenamento do pedal: bit do liga/desliga, registro de modelo, parâmetros `k*8..` e bloco dos comandos. */
  block: number
  color: string
}

/**
 * Slots na ordem "de fábrica" da cadeia (NR, PRE, DST, NS, AMP, CAB, EQ, MOD, DLY, RVB). DST, NS, AMP, CAB e EQ
 * formam um núcleo contíguo que o pedal não deixa reordenar. O índice de armazenamento (`block`) é outro: NR=0 … RVB=8, NS=9.
 */
export const SLOTS: SlotDef[] = [
  { id: 'NR', label: 'NR', block: 0, color: '#9aa0a6' },
  { id: 'PRE', label: 'PRE', block: 1, color: '#c026d3' },
  { id: 'DST', label: 'DST', block: 2, color: '#e11d48' },
  { id: 'NS', label: 'N->S', block: 9, color: '#7c3aed' },
  { id: 'AMP', label: 'AMP', block: 3, color: '#f59e0b' },
  { id: 'CAB', label: 'CAB', block: 4, color: '#f97316' },
  { id: 'EQ', label: 'EQ', block: 5, color: '#c9a877' },
  { id: 'MOD', label: 'MOD', block: 6, color: '#22d3ee' },
  { id: 'DLY', label: 'DLY', block: 7, color: '#ec4899' },
  { id: 'RVB', label: 'RVB', block: 8, color: '#2563eb' },
]

/**
 * O volume do preset aparece como um último bloco VOL (como no PacketMaster e no Blackbox): não é um módulo do
 * protocolo, só o ajuste de volume do preset. Fica sempre ligado, depois dos 10 módulos, e não se move.
 */
export const VOLUME_SLOT_ID = 'VOL'
export const VOLUME_EFFECT_CODE = 1

export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s])) as Record<SlotId, SlotDef>

export const BLOCK_COUNT = SLOTS.length
export const PARAMS_PER_BLOCK = 8

/** 100 presets; o app numera de 1 e o protocolo de 0. */
export const MIN_PRESET = 1
export const MAX_PRESET = 100
/** O comando de salvar carrega um nome de 10 caracteres ASCII. */
export const PRESET_NAME_LENGTH = 10

/** Primeiro byte do payload: leitura/consulta, comando e ACK do pedal. */
export const KIND = { SET: 0x11, GET: 0x12, ACK: 0x14 } as const

/** Seletores de leitura (`[0x12, sel]`). */
export const READ = {
  USER_IRS: 0x20,
  SNAPTONES: 0x24,
  PRESET_NAMES: 0x40,
  CURRENT_PATCH: 0x41,
  CURRENT_SLOT: 0x43,
  /** Só GP-50: flag de 1 byte "preset ativo editado". */
  MODIFIED: 0x45,
} as const

/** Códigos de função dos comandos (`[0x11, fn, ...]`) que o app envia. */
export const CMD = {
  PATCH_SETTING: 0x42,
  SELECT_PRESET: 0x43,
  SET_ORDER: 0x44,
  SET_MODEL: 0x47,
  SET_PARAM: 0x48,
  SET_BLOCK: 0x49,
  SAVE_PRESET: 0x4a,
  /** Aviso do pedal: uma lista mudou (`data[0]`: 2 presets, 3 SnapTones, 4 IRs de usuário). */
  LIST_CHANGED: 0x1b,
} as const

/** Registro de ajuste do preset que carrega o volume (`[u32 registro][u32 valor]`). */
export const PATCH_VOLUME_RECORD = 0x2001

/**
 * Funções que o app nunca envia (a 0x1C trava o pedal, 0x31 renomeia o Bluetooth, 0x33 ativa idioma, 0x3F é o
 * reset de fábrica, 0x53 lista músicas e 0x60..0x6E são a atualização de firmware).
 */
export const isForbiddenFn = (fn: number) => [0x1c, 0x31, 0x33, 0x3f, 0x53].includes(fn) || (fn >= 0x60 && fn <= 0x6e)

/** Tamanho do corpo devolvido pela leitura 0x41 — identifica o modelo conectado. */
export const BODY_LENGTH: Record<Gp5Device, number> = { gp5: 466, gp50: 511 }
