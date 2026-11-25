import { GP5_NAME_HINT, GP50_NAME_HINT } from './portHints'
import type { DeviceProfile, DeviceSlot } from '../../../sdk/types'
import { SLOT_ICONS } from '../../../sdk/shared/slotIcons'
import { AMBIENCE_CAVEAT, NEVER_COMPENSATE } from '../../../sdk/shared/aiPromptText'
import { createGp5Catalog } from './data/effectsCatalog'
import {
  buildPresetVolume,
  buildSavePreset,
  buildSelectModel,
  buildSelectPresetCc,
  buildSelectPresetSysex,
  buildSetParameter,
  buildToggle,
  coalesceKey,
  parseGp5Message,
} from './protocol/commands'
import { MAX_PRESET, MIN_PRESET, PRESET_NAME_LENGTH, SLOT_BY_ID, SLOTS, VOLUME_SLOT_ID, type Gp5Device, type SlotId } from './protocol/constants'
import { createGp5Sync } from './sync'

const slots: DeviceSlot[] = [
  ...SLOTS.map((s) => ({ id: s.id, label: s.label, color: s.color, icon: SLOT_ICONS[s.id] })),
  { id: VOLUME_SLOT_ID, label: 'VOL', color: '#16a34a', icon: SLOT_ICONS.VOL },
]

const block = (slotId: string) => {
  const def = SLOT_BY_ID[slotId as SlotId]
  if (!def) throw new Error(`Slot desconhecido: ${slotId}`)
  return def.block
}

const EQ_BANDS = `## Real EQ band centers on this pedal (EQ slot; bands ±50, step 1, plus a VOL)
- Guitar EQ 1: 125Hz, 400Hz, 800Hz, 1.6kHz, 4kHz
- Guitar EQ 2: 100Hz, 500Hz, 1kHz, 3kHz, 6kHz
Pick the EQ variant whose bands actually fall near where the measured delta is, instead of defaulting to Guitar EQ 1. The other EQ models have their own band centers: read them with get_effect_details.`

const CATEGORY_MAP = `## From glossary categories to this pedal's slots
The server's feature_glossary names effect CATEGORIES, not blocks. On this pedal they map to:
- gain, clipping_type: DST (overdrive/distortion/fuzz), PRE (boosts: Micro Boost, B-Boost, Boost), AMP/NS gain
- tone_stack: AMP (or NS) bass/mid/treble/presence
- cab: CAB (a SnapTone of a full rig already includes its cab)
- eq: EQ slot; a DST/PRE tone knob for broad tilt before the amp
- compressor: PRE (COMP, COMP4)
- wah_filter: PRE filters (Toucher, Crier; C-Wah on the GP-50)
- modulation: MOD (tremolo/vibrato/chorus/phaser/flanger); PRE also has pitch/octave/detune
- delay: DLY · reverb: RVB
- gate: NR — only moves noise.*, which is EXCLUDED from the tone distance; touch it only for an audible gating problem
- level: VOL (preset volume) and the level knob of each effect — level.* is EXCLUDED from the tone distance; never chase a level delta as tone
Priority order — the evaluation order above, mapped onto slots and descriptor groups. Work the earliest step whose groups still show clear differences (salience > 3) in largest_differences; move on only when its groups are near ~1 or stop improving:
1. Amp + cab (AMP/NS, CAB) — broad spectrum.* shape (tilt, centroid, rolloff, region shares) together with harmonics.*. Prefer swapping amp/cab over extreme EQ.
2. Gain staging (AMP/NS gain, DST, PRE boosts) — harmonics.* (rolloff, even/odd) plus dynamics.* (transient_to_sustain, span) moving together.
3. Broad then corrective EQ (EQ slot, tone stack) — remaining spectrum.third_octave_db.* deltas once harmonics.* is close.
4. Dynamics (PRE COMP/COMP4) — dynamics.* left over after gain is right (attack, sustain, span).
5. Filters (PRE Toucher/Crier) — only for a narrow resonant peak that EQ bands can't reach.
6. Ambience (MOD, then DLY, then RVB) — modulation.* and space.*, last, following the ambience caveat below.
${NEVER_COMPENSATE}

Disabled slots count too: if a group pattern points to a block that is off (e.g. harmonics + dynamics say "more drive" and DST is off), enabling it with a sensible effect is a valid correction — check the chain state, then select_effect + get_effect_details before setting its parameters.

${AMBIENCE_CAVEAT}`

const PROMPT_NOTES = `The chain has 11 slots in this signal order: NR, PRE, DST, NS, AMP, CAB, EQ, MOD, DLY, RVB, VOL. DST, NS, AMP, CAB and EQ form a fixed block in that order — the pedal does not reorder them, and this app does not move modules on this pedal. VOL is the preset volume, always the last block: it is always on and cannot be toggled or moved; adjust it with set_parameter.

AMP vs NS — pick ONE amp source: NS ("N->S"/SnapTone) loads a captured NAM amp profile and is itself a full amp simulation, the same role as the AMP slot. Use AMP by default, and NS only when the user asks for a NAM/SnapTone/captured profile; then leave AMP disabled (toggle_slot enabled=false) instead of stacking two amp sims in series.

select_effect already swaps the model and the pedal loads that model's default knob values, so set_parameter after it. Edits are live until saved: save_preset writes the active preset to the pedal, with a name of up to 10 ASCII characters, and overwrites that slot.`

const PROFILE_TEXT: Record<Gp5Device, { id: 'gp5' | 'gp50'; name: string }> = {
  gp5: { id: 'gp5', name: 'Valeton GP-5' },
  gp50: { id: 'gp50', name: 'Valeton GP-50' },
}

function createGp5Profile(device: Gp5Device): DeviceProfile {
  const { id, name } = PROFILE_TEXT[device]
  const catalog = createGp5Catalog(device)
  return {
    id,
    name,
    portHint: device === 'gp5' ? GP5_NAME_HINT : GP50_NAME_HINT,
    badge: 'experimental',
    slots,
    // O GP-5 numera os presets de 00 a 99 (o slot do protocolo); o GP-50 segue em 01-100.
    presetLabel: (preset) => String(device === 'gp5' ? preset - MIN_PRESET : preset).padStart(2, '0'),
    minPreset: MIN_PRESET,
    maxPreset: MAX_PRESET,
    presetNameLength: PRESET_NAME_LENGTH,
    capabilities: {
      reorder: false,
      presetFiles: false,
      fractionalParams: true,
      selectEffectEnables: true,
      savePreset: true,
      ai: true,
      presetLibrary: false,
      reamp: false,
    },
    ai: {
      deviceName: name,
      ampSlot: 'AMP',
      cabSlot: 'CAB',
      catalogSlots: ['AMP', 'CAB'],
      promptNotes: PROMPT_NOTES,
      fineTuning: { eqBands: EQ_BANDS, categoryMap: CATEGORY_MAP, audioDevicePrefixes: ['gp-'] },
    },
    // Espaço entre comandos: o pedal descarta os que chegam colados (os editores oficiais e abertos mandam um a cada 20-25 ms).
    sendGapMs: 40,
    // Select Modelo + ON em sequência: dá tempo de o pedal assentar o select antes do toggle.
    intraCommandGapMs: 100,
    coalesceKey,
    alwaysOnSlots: [VOLUME_SLOT_ID],
    fixedSlots: [VOLUME_SLOT_ID],
    getEffects: catalog.getEffects,
    findEffect: catalog.findEffect,
    setEffectNames: catalog.setEffectNames,
    commands: {
      toggleSlot: (slotId, enabled) => (slotId === VOLUME_SLOT_ID ? [] : buildToggle(block(slotId), enabled)),
      // O GP-5 só segue o Control Change #0 (ignora Program Change); o GP-50 seleciona por SysEx, como o Valeton Suite.
      selectPreset: (preset) => (device === 'gp5' ? buildSelectPresetCc(preset) : buildSelectPresetSysex(preset)),
      // Liga/desliga é um comando à parte do select de modelo (como no GP-150): escolher um modelo liga o bloco.
      selectEffect: (slotId, effect) =>
        slotId === VOLUME_SLOT_ID ? [] : [...buildSelectModel(block(slotId), effect.effectCode), ...buildToggle(block(slotId), true)],
      setParameter: (slotId, slot, paramIndex, value) =>
        slotId === VOLUME_SLOT_ID ? buildPresetVolume(value) : slot.effectCode == null ? [] : buildSetParameter(block(slotId), paramIndex, value),
      savePreset: (preset, presetName) => buildSavePreset(preset, presetName),
    },
    sync: createGp5Sync(device),
    parseIncoming: parseGp5Message,
  }
}

export const gp5Profile = createGp5Profile('gp5')
export const gp50Profile = createGp5Profile('gp50')

/** Ponto de entrada do plugin (API 1): o app chama a cada carga e recarga. */
export default function createProfiles(): DeviceProfile[] {
  return [createGp5Profile('gp5'), createGp5Profile('gp50')]
}
