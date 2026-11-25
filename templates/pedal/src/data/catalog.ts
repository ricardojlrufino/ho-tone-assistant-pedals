import type { EffectDef } from '../../../../sdk/types'
import effects from './effects.json'

const CATALOG = effects as unknown as Record<string, EffectDef[]>

export const getEffects = (slotId: string): EffectDef[] | undefined => CATALOG[slotId]

export const findEffect = (slotId: string, effectCode: number): EffectDef | undefined => CATALOG[slotId]?.find((e) => e.effectCode === effectCode)
