# Referência do `DeviceProfile`

O perfil é tudo que o app sabe sobre o seu pedal. A definição completa e comentada está em [`sdk/types.ts`](../sdk/types.ts); aqui está o que cada campo faz na prática.

## Identidade

| Campo | Descrição |
|---|---|
| `id` | Único entre o app e todos os plugins. Também é a chave do estado salvo e das estatísticas de uso. |
| `name` | Nome no seletor de pedal e nos textos. |
| `portHint` | `RegExp` que casa com o **nome da porta MIDI** que o sistema mostra. Com ela o app escolhe a porta e o perfil sozinho. Sem as flags `g`/`y`. **Não deixe casar com outros pedais** (veja "Detecção da porta"). |
| `badge` | Texto curto ao lado do título: `experimental`, firmware testado... |
| `ble` | Só para pedais com BLE-MIDI. Não validado em plugins; use USB. |

### Detecção da porta

O app procura o perfil cujo `portHint` casa com o nome da porta de saída selecionada. Os perfis do app têm prioridade sobre os plugins, **exceto** que o do GP-150 casa com qualquer porta que contenha "valeton": portanto um pedal Valeton precisa de um `portHint` mais específico (`/gp-?50(?!\d)/i`) e é testado antes. O `(?!\d)` do GP-5 evita que ele case com "GP-50" e "GP-150".

Portas "Midi Through" e pontes BLE do SO são ignoradas.

## Cadeia de sinal

| Campo | Descrição |
|---|---|
| `slots` | Módulos na **ordem de fábrica** da cadeia: `id` (curto, único, ex.: `AMP`), `label`, `color` (destaque quando ligado) e `icon` (URL da imagem; pode ser data URL, e o `sdk/shared/slotIcon.ts` gera um SVG com o rótulo). |
| `getEffects(slotId)` / `findEffect(slotId, effectCode)` | O catálogo de efeitos do slot. `effectCode` identifica o efeito **no seu protocolo** e é o que o pedal devolve na leitura. |
| `capabilities.reorder` | O usuário pode arrastar módulos (precisa de `commands.moveChain`). |
| `fixedSlots` | Slots que não podem ser arrastados (ex.: um bloco fixo, o volume). |
| `planChainMove` | Calcula a nova ordem quando o pedal tem restrições (grupos contíguos). |
| `alwaysOnSlots` | Slots que não podem ser desligados (ex.: o volume do preset). |
| `lockedSlots` | Slots bloqueados pelo estado atual (ex.: AMP bloqueado quando o NAM está ativo). |

## Efeitos e parâmetros (`EffectDef`)

Cada efeito tem `effectCode`, `name`, `parameters` e, opcionalmente, `description`/`summary` (texto para o usuário e para a IA), `group` (agrupa em `<optgroup>`) e campos específicos de protocolos (`extra17`, `tail`, `moduleId`).

Cada parâmetro (`EffectParameterDef`):

| `type` | Como aparece | Campos |
|---|---|---|
| `slider` | Controle deslizante | `min`, `max`, `step`, `default` (número), `unit`, `display` (escala só de exibição) |
| `toggle` | Chave liga/desliga | `default` boolean; o valor cru é 0/1 |
| `dropdown` | Lista | `options` (nomes), `optionValues` (valor cru de cada um, mesma ordem), `default` (o **nome** da opção) |

`index` é a posição do parâmetro **no protocolo** (o que `setParameter` recebe), e **não** precisa ser contíguo nem ordenado. O `value` que chega em `setParameter` é sempre o valor cru, na mesma faixa declarada em `min`/`max`; a conversão para bytes é sua. Se o pedal usa fração (ex.: `0.1` dB), use `capabilities.fractionalParams: true` e `step` fracionário; do contrário o app só envia inteiros.

Escolher um efeito não diz ao app quais valores o pedal passa a ter: o app usa os `default` do catálogo. Se o pedal carrega outros, ligue `sync.resyncOnEffectChange` para reler o estado depois.

## Presets

| Campo | Descrição |
|---|---|
| `minPreset` / `maxPreset` | Faixa **do app** (1-based, normalmente). A conversão para o número do protocolo é feita em `commands.selectPreset`. |
| `presetLabel(n)` | Rótulo no seletor (ex.: o GP-5 numera de `00` a `99`). |
| `maxSavablePreset` | Maior preset que aceita gravação (os de fábrica ficam acima). |
| `presetNameLength` | Tamanho máximo do nome ao salvar (padrão 16). |
| `commands.savePreset` | Grava o preset ativo; use junto de `capabilities.savePreset`. |

## Comandos (`commands`)

Cada função devolve `Uint8Array[]`: os frames a enviar, **em ordem**. Retornar `[]` significa "nada a enviar" (ex.: o slot VOL não tem liga/desliga).

| Função | Quando |
|---|---|
| `toggleSlot(slotId, enabled, transport)` | Liga/desliga um módulo. |
| `selectPreset(preset, transport)` | Troca de preset (número do app). |
| `selectEffect(slotId, effect, current, transport)` | Troca o efeito do slot. `current` é o estado local do slot. |
| `setParameter(slotId, slot, paramIndex, value, transport)` | Muda um parâmetro. `slot.effectCode` é o efeito atual (`null` = ainda desconhecido). |
| `moveChain?(order, transport)` | Reordena a cadeia. |
| `setPresetVolume?(volume, transport)` | Volume do preset (0-100). |
| `savePreset?(preset, name, transport)` | Grava o preset ativo. |

Lance exceção (`RangeError`) para argumentos fora da faixa em vez de enviar lixo ao pedal.

## Ritmo de envio

| Campo | Descrição |
|---|---|
| `sendGapMs` | Intervalo mínimo entre frames. Muitos pedais **descartam** comandos que chegam colados; comece com 30-40 ms. |
| `intraCommandGapMs` | Espera entre os frames de **um mesmo** comando (ex.: selecionar o modelo e depois ligar o bloco). |
| `coalesceKey(frame)` | Dois frames na fila com a mesma chave viram um só (vale o último). Use para o mesmo parâmetro girado várias vezes. Devolva `null` para o que nunca deve ser fundido. |

## Leitura do estado (`sync`)

Opcional, mas é o que mantém a tela igual ao pedal. O app usa `MidiLink` (frames SysEx completos, em ambos os sentidos).

| Função | Obrigatória no `sync` | Descrição |
|---|---|---|
| `readState(link)` | sim | Lê o preset ativo e devolve um `DeviceSnapshot`: por slot `{ enabled, effectCode, parameters }`, `chainOrder`, `presetVolume`, `presetName?`. Rejeite no timeout. |
| `readPresetNames(link)` | sim | Nomes de todos os presets, na ordem (índice 0 = preset 1). Devolva `[]` se o pedal não lista. |
| `requestCurrentPreset(link)` | sim | Pergunta o número do preset ativo; a resposta chega por `parseIncoming` como evento `preset`. |
| `requestModifiedStatus(link)` | sim | Pergunta se o preset foi editado; a resposta vira o evento `modified`. |
| `readUserEffectNames?(link)` | não | Nomes dados pelo usuário a efeitos (IRs, capturas), por slot e `effectCode`; use junto de `profile.setEffectNames`. |
| `statusPollMs?` | não | Se o pedal não avisa troca de preset, pergunta a cada tanto. |
| `resyncOnEffectChange?` | não | Relê o estado depois de trocar de efeito pelo app. |

O app serializa as leituras: **uma por vez** no pedal, porque as respostas multi-pacote chegam todas pelo mesmo canal.

## Avisos do pedal (`parseIncoming`)

Recebe cada mensagem SysEx e devolve um evento ou `null` para o que não reconhece. Eventos: `preset`, `toggle`, `effect`, `parameter`, `ampMode`, `presetVolume`, `chain`, `modified`. Com isso, mexer no pedal atualiza a tela sem releitura. **Nunca lance exceção**: uma mensagem estranha deve virar `null`.

## Assistente de IA (`ai`)

Com `capabilities.ai`, o pedal ganha o assistente e as ferramentas MCP. O bloco `ai` diz ao modelo o que o catálogo sozinho não diz:

| Campo | Descrição |
|---|---|
| `deviceName` | Nome nos prompts. |
| `ampSlot` / `cabSlot` | Slots de amp e gabinete (destacados no resultado). |
| `catalogSlots` | Slots cujo catálogo vai **direto no prompt**. Mantenha pequeno (os grandes, como milhares de capturas NAM, estouram o prompt). |
| `promptNotes` | **Em inglês.** Regras do pedal: ordem dos módulos, exclusões entre módulos, slots fixos, como o `select_effect` se comporta, limites do nome de preset. |
| `fineTuning` | Opcional: `categoryMap` (categorias genéricas de timbre → slots do pedal), `eqBands`, `audioDevicePrefixes`. Veja o plugin do GP-5/GP-50 como exemplo. |

## `capabilities`

`reorder`, `presetFiles`, `fractionalParams`, `selectEffectEnables`, `savePreset`, `ai`, `presetLibrary`, `reamp`. Os dois últimos, e `presetFiles`, dependem de fluxos internos do GP-150 e **devem ser `false`** em plugins. `selectEffectEnables: true` diz que escolher um efeito já liga o slot (o plugin ainda pode mandar o "ligar" junto, como o GP-5/GP-50 faz em `selectEffect`).
