/** Trechos dos prompts de Fine-Tuning que valem para qualquer pedal Valeton (cada perfil monta o seu mapa de categorias). */

export const NEVER_COMPENSATE = 'Never treat a later step to compensate an earlier one (e.g. reverb or EQ to mask too much gain).'

export const AMBIENCE_CAVEAT =
  'Ambience caveat: when the reference comes from a mixed song, part of its space.* (reverb/delay) and even modulation.* may be mix processing, not the guitarist\'s rig. Fix structure, gain and spectrum first (the evaluation order above); treat space.*/modulation.* differences as rig changes only when they are large (salience > 3) and consistent across rounds, and prefer modest mix values over matching the tail exactly.'
