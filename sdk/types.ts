/**
 * Contrato entre o app HO-Tone Assistant e os plugins de pedal (API 1).
 *
 * Cópia de `src/devices/types.ts` do app: só tipos, apagados na compilação. Ao subir a `apiVersion`, atualize este arquivo
 * junto com o app (veja docs/formato-do-plugin.md).
 */

/**
 * Enlace com o pedal, independente do transporte (USB MIDI ou BLE-MIDI). O plugin só enxerga frames SysEx
 * completos (`F0 ... F7`) entrando e saindo.
 */
export interface MidiLink {
  kind: 'usb' | 'ble'
  /** Nome da porta MIDI ou do dispositivo BLE. */
  name: string
  send: (frame: Uint8Array) => void
  /** Recebe cada frame SysEx completo vindo do pedal; devolve a função que cancela. */
  subscribe: (listener: (frame: Uint8Array) => void) => () => void
}

export interface BleConfig {
  /** Nome anunciado pelo pedal (usado como filtro do seletor do navegador). */
  deviceName: string
  /** Prefixos de nome aceitos além de `deviceName` (o pedal pode anunciar "Pocket Master BLE" em vez de "Sonic Master BLE"). */
  namePrefixes?: string[]
  serviceUuid: string
  characteristicUuid: string
}


/** Aberto: os plugins (`src/plugins/`) trazem ids próprios. */
export type DeviceId = 'gp150' | 'gp200' | 'matribox' | 'packetmaster' | 'blackbox' | (string & Record<never, never>)

/** Id de slot — específico de cada dispositivo (ver `devices/`). */
export type SlotId = string

export interface EffectParameterDef {
  name: string
  /** "slider" | "toggle" | "dropdown" */
  type: string
  /** Índice do parâmetro no comando "Ajustar Parâmetro" de cada protocolo. */
  index: number
  min?: number
  max?: number
  /** number para slider, boolean para toggle, string (nome da opção) para dropdown */
  default?: number | boolean | string
  options?: string[]
  /** Valor cru enviado por SysEx para cada opção de `options`, mesma ordem. */
  optionValues?: number[]
  step?: number
  unit?: string
  /** Escala só de exibição: o valor cru (`min`-`max`) mapeia linearmente para `display.min`-`display.max` (ex: HighCut do Blackbox, 0-100 = 5k-18k Hz). */
  display?: { min: number; max: number }
}

/** União dos campos dos catálogos de todos os dispositivos; cada um preenche só os que usa. */
export interface EffectDef {
  effectCode: number
  name: string
  fxtitle?: string
  description?: string
  summary?: string
  parameters: EffectParameterDef[]
  seq?: number
  /** Matribox: bit extra em [17] (slots de IR de usuário do CAB). */
  extra17?: number
  /** PacketMaster: 4 bytes finais do comando "Selecionar Efeito". */
  tail?: number[]
  /** PacketMaster: módulo do protocolo quando difere do slot. */
  moduleId?: number
  /** Agrupa efeitos de uma mesma lista (ex: perfis NAM entre os amps) — vira `<optgroup>`. */
  group?: string
  shortForm?: boolean
}

/** Efeito de um slot num preset importado/sincronizado. */
export interface PresetEffect {
  moduleId: SlotId
  effectName: string
  enabled: boolean
  effectCode: number
  /** Posição do módulo na cadeia de sinal, 0-based. */
  chainPosition: number
  /** Valores crus indexados por `param.index`; `null` = sem valor confiável. */
  params: (number | null)[]
}

export interface DeviceSlot {
  id: SlotId
  label: string
  /** Cor de destaque do módulo quando ligado. */
  color: string
  icon: string
}

/** Estado local mínimo de um slot, necessário para montar alguns comandos (ex: Matribox precisa do `effectCode`). */
export interface SlotCommandContext {
  effectCode: number | null
  extra17: number
}

/** Mudança feita no próprio pedal (footswitch/knob), reconhecida a partir de uma mensagem SysEx recebida. */
export type DeviceEvent =
  | { type: 'preset'; preset: number }
  | { type: 'toggle'; slotId: SlotId; enabled: boolean }
  | { type: 'effect'; slotId: SlotId; effectCode: number }
  /** `group`: grupo do efeito a que o valor se refere (ex: Clone); ignorado se o slot usa outro grupo. */
  | { type: 'parameter'; slotId: SlotId; paramIndex: number; value: number; group?: string }
  /** O pedal trocou entre o amp de fábrica e o Clone/NAM — o efeito ativo do AMP mudou, vale reler. */
  | { type: 'ampMode'; clone: boolean }
  | { type: 'presetVolume'; volume: number }
  /** Ordem do sinal: ids dos módulos do primeiro ao último. */
  | { type: 'chain'; moduleIds: number[] }
  /** O preset ativo tem alterações não salvas (`true`) ou acabou de ser salvo (`false`). */
  | { type: 'modified'; modified: boolean }

export interface DeviceCapabilities {
  /** Mover módulos na cadeia (drag-and-drop). */
  reorder: boolean
  /** Importar presets `.prst` e ler o preset ativo do pedal (bulk-read). */
  presetFiles: boolean
  /** Sliders com passo fracionário são enviáveis (codificação confirmada). */
  fractionalParams: boolean
  /** Escolher um efeito liga o slot (Matribox e PacketMaster mandam um ON junto). */
  selectEffectEnables: boolean
  /** Gravar o preset ativo no pedal pelo app (comando de salvar). */
  savePreset: boolean
  /** Assistente de IA e MCP (catálogo e prompts do dispositivo em `DeviceProfile.ai`). */
  ai: boolean
  /** Biblioteca de presets do app (`PresetLibrary`) e leitura do preset ativo via `useActivePresetSync` — fluxo do GP-150. */
  presetLibrary: boolean
  /** Reamp (tocar o dry gravado de volta pela entrada do pedal): controla só os botões de Reamp dentro do Fine-Tuning (que todos os dispositivos têm). */
  reamp: boolean
}

/** O que o assistente de IA precisa saber do dispositivo além do catálogo e dos slots. */
export interface DeviceAiConfig {
  /** Nome do pedal como aparece no prompt de sistema ("Valeton GP-150", "Sonicake Matribox 1"). */
  deviceName: string
  /** Slot do amp e do gabinete/IR — destacados no resultado e embutidos no prompt. */
  ampSlot: SlotId
  cabSlot: SlotId
  /** Slots cujo catálogo vai direto no prompt (evita uma `list_effects_for_slot` certa a cada pedido). */
  catalogSlots: SlotId[]
  /** Regras específicas do pedal (exclusões entre módulos, slots fixos, ...), em inglês, já no formato do prompt. */
  promptNotes: string
  /** Configuração do Fine-Tuning (opcional). */
  fineTuning?: {
    /** Seção "bandas de EQ reais" do prompt (opcional). */
    eqBands?: string
    /** Mapa das categorias genéricas do mcp-guitar-ears para os slots deste pedal e ordem de prioridade. */
    categoryMap: string
    /** Prefixos (minúsculos) do nome do dispositivo de áudio para pré-selecionar no Reamp. */
    audioDevicePrefixes: string[]
  }
}

/** Como a mensagem sai do app: `midi` = Web MIDI/USB, `ble` = Web Bluetooth. */
export type CommandTransport = 'midi' | 'ble'

export interface DeviceProfile {
  id: DeviceId
  name: string
  /** Casa com o nome da porta MIDI para auto-detecção. */
  portHint: RegExp
  /** Presente quando o pedal também fala BLE-MIDI (Sonicake). */
  ble?: BleConfig
  /** Texto curto exibido ao lado do título (firmware testado, "experimental", ...). */
  badge?: string
  slots: DeviceSlot[]
  /** Rótulo do preset no seletor (padrão do PacketMaster: P01-P50 / F01-F50). */
  presetLabel?: (preset: number) => string
  minPreset: number
  maxPreset: number
  /** Maior preset que aceita gravação (os de fábrica ficam acima); sem valor, todos aceitam. */
  maxSavablePreset?: number
  /** Tamanho máximo do nome do preset ao salvar; sem valor, 16. */
  presetNameLength?: number
  capabilities: DeviceCapabilities
  /** Obrigatório quando `capabilities.ai`. */
  ai?: DeviceAiConfig
  /** Intervalo mínimo entre comandos enviados ao pedal, em ms (0 = sem espaçamento). */
  sendGapMs?: number
  /** Só nos pedais que aceitam importar IR (hoje o Blackbox). */
  irImport?: DeviceIrImport
  /** Estado `enabled` do slot logo após escolher um efeito, quando depende do efeito (GP-150: "None" desliga); `null`/ausente = vale `capabilities.selectEffectEnables`. */
  enabledAfterSelectEffect?: (effect: EffectDef) => boolean | null
  /** Espera, em ms, entre os frames de um mesmo comando que devolve vários (ex: Select Efeito + ON). */
  intraCommandGapMs?: number
  /** Comandos que se substituem na fila de envio (ex: o mesmo parâmetro girado várias vezes): mesma chave = só o último vale. */
  coalesceKey?: (frame: Uint8Array) => string | null
  /** Slots bloqueados pelo estado atual (aparecem desligados e não aceitam ligar nem trocar de efeito). */
  lockedSlots?: (slots: Record<SlotId, { effectCode: number | null }>) => SlotId[]
  /** Slots que não podem ser desligados (ex: o VOL do PacketMaster, que é o volume do preset). */
  alwaysOnSlots?: SlotId[]
  /** Slots que não podem ser arrastados (ex: o bloco fixo DRV-AMP-IR-EQ do PacketMaster). */
  fixedSlots?: SlotId[]
  /** Calcula a nova ordem ao soltar `movedIndex` em `targetPosition`, quando o dispositivo tem restrições. */
  planChainMove?: (chainOrder: readonly number[], movedIndex: number, targetPosition: number) => number[]
  getEffects: (slotId: SlotId) => EffectDef[] | undefined
  findEffect: (slotId: SlotId, effectCode: number) => EffectDef | undefined
  /** Cada função devolve os frames a enviar, em ordem; `transport` escolhe o envelope quando o protocolo tem mais de um. */
  commands: {
    toggleSlot: (slotId: SlotId, enabled: boolean, transport: CommandTransport) => Uint8Array[]
    selectPreset: (preset: number, transport: CommandTransport) => Uint8Array[]
    /** `current` é o estado local do slot, para o dispositivo saber se precisa trocar de modo antes. */
    selectEffect: (slotId: SlotId, effect: EffectDef, current: SlotCommandContext, transport: CommandTransport) => Uint8Array[]
    setParameter: (
      slotId: SlotId,
      slot: SlotCommandContext,
      paramIndex: number,
      value: number,
      transport: CommandTransport,
    ) => Uint8Array[]
    moveChain?: (chainOrder: readonly number[], transport: CommandTransport) => Uint8Array[]
    /** Volume do preset ativo, 0-100. */
    setPresetVolume?: (volume: number, transport: CommandTransport) => Uint8Array[]
    /** Grava o preset ativo (`preset` é o número 1-based). */
    savePreset?: (preset: number, name: string, transport: CommandTransport) => Uint8Array[]
  }
  /** Aplica ao catálogo os nomes lidos por `sync.readUserEffectNames`. */
  setEffectNames?: (names: Record<string, Record<number, string>>) => void
  /** Leitura do estado do pedal via `MidiLink` — fluxo Sonicake; o GP-150 usa `state/useActivePresetSync`. */
  sync?: DeviceSync
  /** Interpreta uma mensagem SysEx recebida do pedal; `null` se não for reconhecida. */
  parseIncoming?: (data: ArrayLike<number>) => DeviceEvent | null
}

/** Estado completo do preset ativo, como lido do pedal. */
export interface DeviceSnapshot {
  /** Por slot: ligado/desligado, efeito (`effectCode` do catálogo) e valores indexados por `param.index`. */
  slots: Record<SlotId, { enabled: boolean; effectCode: number | null; parameters: Record<number, number> }>
  /** Posição de cada slot na cadeia, indexado pela posição do slot em `profile.slots`. */
  chainOrder: number[]
  presetVolume: number | null
  /** Nome do preset ativo, quando o dump o traz (GP-200, que não tem tabela de nomes). */
  presetName?: string | null
}

/** Importação de IR de cabine (WAV) pelo app; a presença no perfil é a capacidade. */
export interface DeviceIrImport {
  sampleRate: number
  sampleCount: number
  nameLength: number
  defaultLevel: number
  /** Nomes dos IRs de CAB já no pedal, por slot (onde a importação grava). Slot vazio = nome em branco. */
  readSlotNames: (link: MidiLink) => Promise<string[]>
  /** Lê o arquivo escolhido (WAV) para amostras mono; lança com mensagem legível se o formato não servir. */
  parseAudio: (file: ArrayBuffer) => { samples: ArrayLike<number>; sampleRate: number }
  /** Converte o áudio (reamostra/ajusta) e devolve os frames do envio, em ordem, mais os avisos da conversão. */
  buildUpload: (audio: { samples: ArrayLike<number>; sampleRate: number }, options: { slot: number; name: string; level: number; normalize?: boolean }) => { frames: Uint8Array[]; notes: string[] }
}

export interface DeviceSync {
  /** Lê o estado do preset ativo (dump). Rejeita em caso de timeout. */
  readState: (link: MidiLink) => Promise<DeviceSnapshot>
  /** Lê o nome de todos os presets, na ordem do número (índice 0 = preset 1). */
  readPresetNames: (link: MidiLink) => Promise<string[]>
  /** Nomes dados pelo usuário a efeitos (ex: IRs carregados), por slot e `effectCode`. */
  readUserEffectNames?: (link: MidiLink) => Promise<Record<string, Record<number, string>>>
  /** Pede o número do preset ativo; a resposta chega como evento `preset` em `parseIncoming`. */
  requestCurrentPreset: (link: MidiLink) => void
  /** Pede o status "preset modificado"; a resposta chega como evento `modified`. */
  requestModifiedStatus: (link: MidiLink) => void
  /** Quando o pedal não avisa troca de preset, pergunta `requestCurrentPreset` a cada tanto (ms). */
  statusPollMs?: number
  /** Trocar o efeito de um slot pelo app não diz quais valores o pedal passa a ter: relê o estado depois. */
  resyncOnEffectChange?: boolean
}
