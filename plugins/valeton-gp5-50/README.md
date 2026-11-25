# Valeton GP-5 / GP-50

Plugin experimental para o **Valeton GP-5** e o **GP-50**, que falam o mesmo protocolo SysEx por USB-MIDI. Este é o plugin de referência do repositório: o template mostra o mínimo, este mostra um pedal real com catálogo grande, leitura de estado e assistente de IA.

> **Nada aqui foi validado em hardware.** Os bytes dos comandos conferem com vetores conhecidos de editores oficiais, mas só o pedal confirma a conversa. O badge `experimental` fica visível no app.

## O que funciona

- Liga/desliga de bloco, troca de modelo, parâmetros em tempo real, troca de preset e salvar (sobrescreve o preset).
- Leitura do preset ativo, nomes dos presets e dos SnapTones/IRs de usuário, e acompanhamento do que muda no pedal.
- Assistente de IA/MCP e Fine-Tuning com o catálogo de cada modelo.

## Limites

- Sem reordenar a cadeia, sem biblioteca/arquivos `.prst`, sem Reamp, sem Bluetooth.
- O toggle **Sync** (divisão de tempo no Time/Rate) não é exposto: o app não sabe interpretar o valor.
- A detecção do GP-5 usa `GP-5` e a do GP-50 usa `GP-50` no nome da porta; o `(?!\d)` impede que um case com o outro e com "GP-150".

## Protocolo, em resumo

- Cada mensagem é `F0`, depois cada byte do buffer em **dois nibbles** (o alto primeiro), depois `F7`. O buffer é `[crc, total, index, len, ...payload]`, com payload de até **19 bytes** por frame, e `crc` é CRC-8 (poly `0x07`, init 0, sem reflexão) sobre `buffer[1..]`. Respostas longas chegam em vários frames e são remontadas (`Reassembler`).
- O primeiro byte do payload é o tipo: `0x11` escrita, `0x12` leitura, `0x14` ACK; o segundo é a função/seletor.
- Comandos: `0x42` ajuste do preset (volume), `0x43` selecionar preset, `0x44` ordem, `0x47` selecionar modelo, `0x48` parâmetro (float32 little-endian), `0x49` liga/desliga bloco, `0x4A` salvar. Leituras: `0x20` IRs de usuário, `0x24` SnapTones, `0x40` nomes dos presets, `0x41` corpo do preset ativo (466 bytes no GP-5, 511 no GP-50), `0x43` slot atual, `0x45` preset modificado (só GP-50).
- O GP-5 só segue Control Change #0 para trocar de preset; o GP-50 seleciona por SysEx.
- **Funções que o plugin nunca monta** (`isForbiddenFn`): `0x1C` (trava o pedal), `0x31` (renomeia o Bluetooth), `0x33` (idioma), `0x3F` (reset de fábrica), `0x53` e `0x60..0x6E` (atualização de firmware).

## Estrutura

```
src/
├── index.ts               # perfis (gp5, gp50), prompt de IA, comandos
├── sync.ts                # leitura do estado e dos nomes
├── portHints.ts           # regex das portas
├── protocol/              # frame (nibbles+CRC), constantes, comandos, corpo do preset
├── data/                  # models.json (catálogo) + effectsCatalog.ts
├── gp5-50.test.ts         # decodificação, nomes, sync com enlace simulado, perfis
```

