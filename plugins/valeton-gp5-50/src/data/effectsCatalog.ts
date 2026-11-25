import type { EffectDef, EffectParameterDef } from '../../../../sdk/types'
import { VOLUME_EFFECT_CODE, VOLUME_SLOT_ID, type Gp5Device, type SlotId } from '../protocol/constants'
import catalogJson from './models.json'

interface RawParam {
  name: string
  index: number
  min: number
  max: number
  step: number
  default: number
  unit?: string
  toggle?: boolean
  labels?: string[]
  /** Parâmetro "Sync" (só GP-50): liga a divisão de tempo do parâmetro `syncs`. */
  syncs?: number
  only?: Gp5Device
}

interface RawModel {
  fxid: number
  block: SlotId
  name: string
  title: string
  type: string
  origin?: string
  params: RawParam[]
  only?: Gp5Device
}

interface CatalogFile {
  models: RawModel[]
  snaptoneParams: RawParam[]
}

const { models: RAW_MODELS, snaptoneParams: SNAPTONE_PARAMS } = catalogJson as unknown as CatalogFile

/** 80 SnapTones (perfis NAM): 0-49 de fábrica, 50-79 de usuário. fxid = 0x0F000000 | n. */
const SNAPTONE_SLOTS = 80
const FIRST_USER_SNAPTONE = 50
const SNAPTONE_FXID_BASE = 0x0f000000

function toParameter(raw: RawParam): EffectParameterDef {
  const base = { name: raw.name, index: raw.index, min: raw.min, max: raw.max, step: raw.step }
  if (raw.toggle) return { ...base, type: 'toggle', default: raw.default !== 0 }
  if (raw.labels) {
    return {
      ...base,
      type: 'dropdown',
      options: raw.labels,
      optionValues: raw.labels.map((_, i) => raw.min + i),
      default: raw.labels[raw.default - raw.min] ?? raw.labels[0],
    }
  }
  return { ...base, type: 'slider', default: raw.default, ...(raw.unit ? { unit: raw.unit } : {}) }
}

function toEffect(model: RawModel, device: Gp5Device): EffectDef {
  // O toggle "Sync" do GP-50 troca o Time/Rate para divisões de tempo — o app não sabe interpretar esse valor, então não o expõe.
  const params = model.params.filter((p) => (!p.only || p.only === device) && p.syncs === undefined)
  const description = model.origin ? `Based on: ${model.origin}` : undefined
  return {
    effectCode: model.fxid,
    name: model.name,
    fxtitle: model.title,
    description,
    summary: description,
    parameters: params.map(toParameter),
  }
}

function snapToneEffect(n: number): EffectDef {
  return {
    effectCode: SNAPTONE_FXID_BASE | n,
    name: `SnapTone ${n}`,
    fxtitle: `Tone Catch ${n + 1}`,
    group: n < FIRST_USER_SNAPTONE ? 'Factory' : 'User',
    parameters: SNAPTONE_PARAMS.map(toParameter),
  }
}

const VOLUME_EFFECTS: EffectDef[] = [
  {
    effectCode: VOLUME_EFFECT_CODE,
    name: 'Volume',
    parameters: [{ name: 'Volume', type: 'slider', index: 0, min: 0, max: 100, default: 50 }],
  },
]

export interface Gp5Catalog {
  getEffects: (slotId: string) => EffectDef[] | undefined
  findEffect: (slotId: string, effectCode: number) => EffectDef | undefined
  /** Nomes lidos do pedal (SnapTones e IRs de usuário), por slot e `effectCode`. */
  setEffectNames: (names: Record<string, Record<number, string>>) => void
}

/** Catálogo de um dos dois pedais: o GP-50 tem 3 modelos e a sincronia de tempo que o GP-5 não tem. */
export function createGp5Catalog(device: Gp5Device): Gp5Catalog {
  const base = new Map<string, EffectDef[]>()
  for (const model of RAW_MODELS) {
    if (model.only && model.only !== device) continue
    const list = base.get(model.block) ?? []
    list.push(toEffect(model, device))
    base.set(model.block, list)
  }
  base.set(
    'NS',
    Array.from({ length: SNAPTONE_SLOTS }, (_, n) => snapToneEffect(n)),
  )
  base.set(VOLUME_SLOT_ID, VOLUME_EFFECTS)

  let overrides: Record<string, Record<number, string>> = {}
  const cache = new Map<string, EffectDef[]>()

  const getEffects = (slotId: string) => {
    const effects = base.get(slotId)
    const names = overrides[slotId]
    if (!effects || !names) return effects
    let cached = cache.get(slotId)
    if (!cached) {
      cached = effects.map((e) => (names[e.effectCode] ? { ...e, name: names[e.effectCode] } : e))
      cache.set(slotId, cached)
    }
    return cached
  }

  return {
    getEffects,
    findEffect: (slotId, effectCode) => getEffects(slotId)?.find((e) => e.effectCode === effectCode),
    setEffectNames: (names) => {
      overrides = names
      cache.clear()
    },
  }
}
