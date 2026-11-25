/**
 * Constantes do protocolo. Tudo aqui é FICTÍCIO: troque pelos valores que você capturou do seu pedal
 * (veja docs/capturando-midi.md).
 */

/** Slots (módulos) na ordem de fábrica da cadeia de sinal. `index` é o número do módulo no protocolo. */
export const SLOTS = [
  { id: 'DRV', label: 'DRV', index: 0, color: '#e11d48' },
  { id: 'AMP', label: 'AMP', index: 1, color: '#f59e0b' },
  { id: 'DLY', label: 'DLY', index: 2, color: '#ec4899' },
  { id: 'RVB', label: 'RVB', index: 3, color: '#2563eb' },
] as const

export type SlotId = (typeof SLOTS)[number]['id']

export const slotIndex = (slotId: string): number => {
  const slot = SLOTS.find((s) => s.id === slotId)
  if (!slot) throw new RangeError(`Slot desconhecido: ${slotId}`)
  return slot.index
}

/** O app numera os presets a partir de `MIN_PRESET`; o protocolo deste pedal começa em 0. */
export const MIN_PRESET = 1
export const MAX_PRESET = 50

/** SysEx: `F0 <fabricante> <modelo> <comando> ...dados... <checksum> F7`. 0x7D é o id reservado para uso não comercial. */
export const MANUFACTURER = 0x7d
export const MODEL = 0x01

export const CMD = {
  TOGGLE: 0x01,
  SELECT_PRESET: 0x02,
  SELECT_EFFECT: 0x03,
  SET_PARAMETER: 0x04,
  /** Pedido de leitura do estado do preset ativo; a resposta chega como `STATE`. */
  REQUEST_STATE: 0x10,
  STATE: 0x11,
  /** O pedal avisa sozinho quando o preset muda (footswitch). */
  PRESET_CHANGED: 0x20,
} as const
