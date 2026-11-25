type SlotId = string
import iconPRE from './assets/PRE.png'
import iconWAH from './assets/WAH.png'
import iconDST from './assets/DST.png'
import iconNS from './assets/NS.png'
import iconAMP from './assets/AMP.png'
import iconNR from './assets/NR.png'
import iconCAB from './assets/CAB.png'
import iconEQ from './assets/EQ.png'
import iconMOD from './assets/MOD.png'
import iconDLY from './assets/DLY.png'
import iconRVB from './assets/RVB.png'
import iconVOL from './assets/VOL.png'

/** Ícones dos módulos (os mesmos do GP-150) para quem usa os ids de módulo PRE, WAH, DST, NS, AMP, NR, CAB, EQ, MOD, DLY, RVB e VOL. */
export const SLOT_ICONS: Record<SlotId, string> = {
  PRE: iconPRE,
  WAH: iconWAH,
  DST: iconDST,
  NS: iconNS,
  AMP: iconAMP,
  NR: iconNR,
  CAB: iconCAB,
  EQ: iconEQ,
  MOD: iconMOD,
  DLY: iconDLY,
  RVB: iconRVB,
  VOL: iconVOL,
}
