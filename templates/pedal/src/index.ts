import type { DeviceProfile, DeviceSlot } from '../../../sdk/types'
import { slotIcon } from '../../../sdk/shared/slotIcon'
import { findEffect, getEffects } from './data/catalog'
import { buildSelectEffect, buildSelectPreset, buildSetParameter, buildToggle, coalesceKey, parseIncoming } from './protocol/commands'
import { MAX_PRESET, MIN_PRESET, SLOTS } from './protocol/constants'
import { exampleSync } from './sync'

const slots: DeviceSlot[] = SLOTS.map((s) => ({ id: s.id, label: s.label, color: s.color, icon: slotIcon(s.label, s.color) }))

function createProfile(): DeviceProfile {
  return {
    // Tem de ser único entre o app e todos os plugins instalados.
    id: 'example-pedal',
    name: 'Example Pedal',
    // TODO: expressão que casa com o NOME DA PORTA MIDI que o sistema mostra (veja docs/capturando-midi.md).
    // Sem `g` nem `y`. Não deixe casar com o nome de outros pedais.
    portHint: /example[ -]?pedal/i,
    // Aparece ao lado do título; deixe "experimental" até validar no pedal de verdade.
    badge: 'experimental',
    slots,
    minPreset: MIN_PRESET,
    maxPreset: MAX_PRESET,
    capabilities: {
      reorder: false,
      presetFiles: false,
      fractionalParams: false,
      // Escolher um efeito já liga o slot neste pedal?
      selectEffectEnables: true,
      savePreset: false,
      ai: true,
      presetLibrary: false,
      reamp: false,
    },
    // Exigido por `capabilities.ai`: o que o assistente de IA precisa saber do pedal.
    ai: {
      deviceName: 'Example Pedal',
      ampSlot: 'AMP',
      cabSlot: 'AMP',
      catalogSlots: ['AMP'],
      promptNotes: 'The chain has 4 slots in this signal order: DRV, AMP, DLY, RVB. This pedal has no cabinet module; the AMP already includes it.',
    },
    // Intervalo mínimo entre comandos. Aumente se o pedal perder comandos que chegam colados.
    sendGapMs: 30,
    coalesceKey,
    getEffects,
    findEffect,
    commands: {
      toggleSlot: (slotId, enabled) => buildToggle(slotId, enabled),
      selectPreset: (preset) => buildSelectPreset(preset),
      selectEffect: (slotId, effect) => buildSelectEffect(slotId, effect.effectCode),
      setParameter: (slotId, slot, paramIndex, value) => (slot.effectCode == null ? [] : buildSetParameter(slotId, paramIndex, value)),
    },
    sync: exampleSync,
    parseIncoming,
  }
}

export const exampleProfile = createProfile()

/** Ponto de entrada do plugin: o app chama a cada carga e recarga e usa os perfis devolvidos. */
export default function createProfiles(): DeviceProfile[] {
  return [exampleProfile]
}
