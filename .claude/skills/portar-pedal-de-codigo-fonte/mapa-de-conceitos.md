# Mapa: o que procurar no código de origem e onde vai no plugin

## O que procurar, por conceito

| Conceito | Palavras para buscar | Vai para |
|---|---|---|
| Porta/dispositivo USB | `VID`, `PID`, `vendorId`, `productId`, `0x301A`, `usb_device_filter`, `MidiManager`, `requestMIDIAccess`, `midi.open`, `portName`, `deviceName` | `portHint`, `PROTOCOLO.md` (transporte) |
| BLE | `UUID`, `characteristic`, `GATT`, `service`, `BluetoothGatt`, `CBCharacteristic` | `PROTOCOLO.md`; o plugin só trata USB hoje |
| Início e fim do frame | `0xF0`, `0xf0`, `0xF7`, `240`, `247`, `SYSEX_START`, `HEADER`, `MAGIC` | `protocol/frame.ts` |
| Fabricante/modelo | três primeiros bytes depois de `F0` (`0x7D`, `0x00 0x21 …`) | `protocol/constants.ts` |
| Checksum | `checksum`, `crc`, `crc8`, `xor`, `sum`, `& 0x7f`, `% 128`, `verify` | `protocol/frame.ts` (e um teste que o confere) |
| Valor em bytes | `>> 7`, `& 0x7F`, `nibble`, `<< 4`, `float`, `Float32`, `DataView`, `ByteBuffer`, `setFloat32`, `littleEndian` | `protocol/frame.ts` (`encode14`) e `commands.ts` |
| Construtores de comando | `build…`, `make…`, `encode…`, `send…`, `setParam`, `toggle`, `selectPreset`, `selectEffect`, `savePreset`, `command(`, `Cmd`, `opcode` | `protocol/commands.ts` → `profile.commands` |
| Leitura de resposta | `parse…`, `decode…`, `onSysex`, `onMessage`, `handle…`, `reassemble`, `dump`, `readPatch` | `sync.ts` (`readState`, `readPresetNames`) e `parseIncoming` |
| Catálogo de efeitos | `effects`, `models`, `algorithms`, `amps`, `cabs`, `catalog`, `*.json`, `strings.xml`, tabelas de nomes | `data/effects.json` (gerado) |
| Faixas e unidades | `min`, `max`, `step`, `default`, `unit`, `ms`, `dB`, `Hz`, `labels`, `options` | `EffectParameterDef` |
| Ritmo | `delay(`, `sleep(`, `setTimeout`, `throttle`, `debounce`, `queue`, `gap` | `sendGapMs`, `intraCommandGapMs`, `coalesceKey` |
| Perigo | `firmware`, `update`, `factory`, `reset`, `format`, `erase`, `wipe`, `bootloader`, `dfu`, `safety`, `readOnly`, `confirm` | lista proibida (`isForbidden…`) |
| Testes e exemplos | `*.test.*`, `fixtures`, `__tests__`, `golden`, hex em comentários | **Testes do plugin** (vetores de bytes) |

## Do conceito de origem para o `DeviceProfile`

| Na origem | No plugin |
|---|---|
| Lista de módulos/blocos da cadeia, na ordem do sinal | `slots` (ids curtos, `label`, `color`, `icon`) |
| Tabela de efeitos por módulo | `getEffects(slotId)` / `findEffect` |
| Código numérico de um efeito | `EffectDef.effectCode` |
| Parâmetro (índice, nome, faixa) | `EffectParameterDef` (`index` = o do **protocolo**, `min`/`max` = faixa **crua** enviada) |
| Parâmetro de lista/enumeração | `type: 'dropdown'` com `options` e `optionValues` |
| Parâmetro liga/desliga | `type: 'toggle'` (valor cru 0/1) |
| Parâmetro com fração/escala (dB, ms) | `step` fracionário + `capabilities.fractionalParams`, ou `display` para só exibir |
| Seleção de preset (0-based) | `commands.selectPreset` (o app é 1-based; converta aqui) |
| Quantidade de presets | `minPreset`/`maxPreset`; `presetLabel` se o pedal numera diferente |
| Salvar | `commands.savePreset` + `capabilities.savePreset`; `presetNameLength` |
| Ordem da cadeia editável | `commands.moveChain` + `capabilities.reorder` (ou `fixedSlots`) |
| Volume do preset | `commands.setPresetVolume`, ou um slot "VOL" sempre ligado (`alwaysOnSlots`) como no GP-5/GP-50 |
| "Ler preset atual" | `sync.readState` → `DeviceSnapshot` |
| Lista de nomes de preset | `sync.readPresetNames` (ou `[]`) |
| Notificação do pedal (footswitch/knob) | `parseIncoming` → `DeviceEvent` |
| Pedido de estado ao conectar | `sync.requestCurrentPreset` / `requestModifiedStatus` (pode ser vazio) |
| Espera entre comandos | `sendGapMs`; entre frames do mesmo comando, `intraCommandGapMs` |
| Mesmo parâmetro enviado em rajada | `coalesceKey` |

## Armadilhas na tradução

- **Ordem de bytes**: Kotlin/Java `ByteBuffer` é big-endian por padrão; `DataView` exige o flag; Python `struct` usa `<`/`>`. O float do GP-5/GP-50 é little-endian, outros pedais são diferentes: confira com um exemplo.
- **Inteiros com sinal**: `Byte` do Kotlin/Java é com sinal (`-128..127`): `0xF0` aparece como `-16`. Um `& 0xFF` na origem é o sinal de que isso importa.
- **Bytes de 7 bits**: tudo depois do `F0` tem de ser `< 0x80`. Se a origem faz `& 0x7F`, preserve.
- **Numeração**: índice de preset e de parâmetro costuma ser 0-based no protocolo e 1-based na interface.
- **Frames longos**: se o pedal responde em vários pacotes, o código de origem remonta; o plugin recebe o SysEx **já completo** pelo `MidiLink`, mas respostas multi-frame de aplicação (um corpo em vários SysEx) você remonta no `sync.ts`.
- **Mesmo código, vários modelos**: um plugin pode devolver vários perfis (o GP-5 e o GP-50 compartilham código); use um parâmetro de fábrica como `createProfile('modelo')`.
- **Catálogo grande demais** para o prompt de IA: deixe `ai.catalogSlots` só com os slots pequenos importantes (amp, gabinete).
