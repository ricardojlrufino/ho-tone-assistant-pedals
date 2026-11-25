# Capturando o protocolo MIDI do pedal

Quase todo pedal com editor para computador conversa por **SysEx** sobre USB-MIDI. O fabricante raramente publica o formato, então o caminho é observar o que o editor oficial (ou o próprio pedal) troca. A ferramenta que usamos para isso é a **[midi-sysex-webdebug](https://github.com/ricardojlrufino/midi-sysex-webdebug)**.

▶️ **[Abrir a ferramenta online](https://ricardojlrufino.github.io/midi-sysex-webdebug/)** — é uma página única, sem instalação.

## O que ela faz

- Conecta a qualquer porta MIDI de **entrada** pela Web MIDI, com SysEx.
- **Reagrupa** SysEx que o navegador entrega em pedaços.
- **Agrupa** pacotes que chegam próximos no tempo (janela configurável): uma ação no pedal costuma gerar vários.
- Deixa **rotular** cada pacote: slot/módulo, ação, efeito, parâmetro, valor, notas.
- Guarda o histórico no navegador e **exporta** em Markdown ou JSON.

Ela só escuta. Para ver também o que o **editor oficial envia** ao pedal, veja "Capturando os dois sentidos" abaixo.

## Captura assistida no Windows (Wireshark/USBPcap)

Para ver **os dois sentidos** (o que o editor oficial manda e o que o pedal responde) no Windows, o caminho é o [Wireshark](https://www.wireshark.org/) com o **USBPcap** (marque a opção no instalador e reinicie o Windows). O repositório traz um leitor que decodifica o USB-MIDI **em tempo real** (`scripts/capture/`) e um skill do Claude Code que conduz a captura, dizendo ao usuário o que fazer no pedal a cada passo:

```text
> vamos capturar o protocolo do meu pedal
```

O skill [`capturar-protocolo-usb`](../.claude/skills/capturar-protocolo-usb/SKILL.md) faz o seguinte, e você também pode usar as ferramentas à mão:

```bat
scripts\capture\capture.cmd list                       :: interfaces USBPcap
scripts\capture\capture.cmd 1 meu-pedal --list         :: acha o dispositivo do pedal (mexa nos botões)
scripts\capture\capture.cmd 1 meu-pedal --device 5     :: captura ao vivo (grava captures\meu-pedal\)
```

Em outro terminal, a cada ação do usuário:

```bash
bun run mark meu-pedal "DLY liga"        # o que ele vai fazer agora
bun run mark meu-pedal --                # repouso (o que chegar aqui é ruído de fundo)
bun run report meu-pedal --last          # mensagens do último passo
bun run report meu-pedal --compare "DLY liga" "DLY desliga"   # bytes que mudam
```

O `captures/<sessão>/raw.pcapng` é a cópia fiel (abre no Wireshark) e `events.jsonl` tem uma linha por mensagem. `captures/` não vai para o Git. Para treinar sem pedal: `bun scripts/capture/demo.ts | bun scripts/capture/live.ts ensaio`.

## Roteiro de captura

Capture **uma coisa de cada vez** e rotule logo depois: no meio de 200 pacotes sem rótulo não dá para lembrar o que era o quê.

1. Abra a ferramenta no Chrome/Edge, **Conectar Web MIDI** e escolha a porta do pedal.
2. Anote a **linha do cabeçalho** de qualquer pacote: os primeiros bytes depois do `F0` costumam ser o id do fabricante e do modelo. Eles identificam o pedal e entram no `portHint`/filtro das suas funções de `parseFrame`.
3. No pedal (ou no editor oficial), faça uma ação por vez e **salve o pacote rotulado**:
   - ligar e desligar cada módulo (varie só o módulo);
   - trocar o efeito de um módulo, anotando o nome do efeito;
   - mexer **um parâmetro** em valores bem diferentes: mínimo, máximo, meio e um valor com casa decimal;
   - trocar de preset (primeiro, segundo, último);
   - salvar preset (com nomes diferentes, para achar o campo do nome).
4. Para cada tipo de comando, compare dois pacotes que diferem em **uma só coisa**. O byte que mudou é o campo.
5. Anote o que é **constante** (cabeçalho, comando), o que é **índice** (módulo, parâmetro, preset) e o que é **valor** (e como ele é codificado: 1 byte, 7+7 bits, nibbles, float32 em bytes de 7 bits...).
6. Exporte em Markdown e guarde no seu plugin (por exemplo em `plugins/<id>/PROTOCOLO.md`). Esse arquivo é a especificação que seus testes vão seguir.

## Capturando os dois sentidos

A captura da ferramenta é de **entrada**: mostra o que o pedal manda. Para ver o que o editor oficial manda ao pedal, use uma destas opções:

- **Porta virtual**: no Linux, `aseqdump`/`amidi` e o `a2jmidid` ou o `snd-virmidi` permitem um "T" entre o editor e o pedal; no Windows, o loopMIDI; no macOS, o driver IAC.
- **Captura USB** com Wireshark (`usbmon` no Linux) filtrando a classe de áudio/MIDI; os dados MIDI vêm em pacotes de 4 bytes (cabeçalho de cabo/CIN + 3 bytes), então SysEx longo aparece "picotado".
- **Ler o comando que o pedal responde** ao seu próprio pedido: muitos pedais respondem a "me dê o estado". Depois que você acha o primeiro pedido, a ferramenta vê as respostas.

Se o pedal tiver Bluetooth, o BLE-MIDI usa o mesmo SysEx com 2 bytes de cabeçalho/timestamp (`80 80`) antes do `F0`; veja `sdk/types.ts` (`BleConfig`).

## Do pacote ao código

Transforme cada pacote rotulado em um **teste com os bytes exatos** antes de escrever a função:

```ts
// Captura: "liga o DLY" → F0 7D 01 01 02 01 02 F7
it('liga o DLY', () => {
  expect(Array.from(buildToggle('DLY', true)[0])).toEqual([0xf0, 0x7d, 0x01, 0x01, 0x02, 0x01, 0x02, 0xf7])
})
```

Com os bytes reais no teste, qualquer erro de índice, ordem ou codificação aparece antes de você plugar o pedal. Veja [Testes e validação](testes-e-validacao.md).

Mapa de onde cada achado vai:

| Achado | Onde fica no plugin |
|---|---|
| Cabeçalho/fabricante/modelo | `protocol/constants.ts`, `parseFrame` |
| Checksum e enquadramento | `protocol/frame.ts` |
| Comandos de ligar, efeito, parâmetro, preset | `protocol/commands.ts` → `profile.commands` |
| O que o pedal avisa sozinho (footswitch, knob) | `parseIncoming` → eventos `preset`, `toggle`, `effect`, `parameter`, ... |
| Resposta de "estado do preset" | `sync.ts` → `readState` |
| Nomes dos presets | `sync.ts` → `readPresetNames` |
| Lista de efeitos, parâmetros e faixas | `data/effects.json` |
| Tempo mínimo entre comandos | `sendGapMs`, `intraCommandGapMs` |

## Cuidados

- **Não reenvie ao pedal pacotes que você não entende.** Muitos editores têm comandos de atualização de firmware, reset de fábrica, renomear Bluetooth ou formatar a memória, e um byte errado pode travar o pedal. Capture, rotule, entenda; só então envie.
- Liste os comandos perigosos e faça o plugin **recusar montá-los**. O plugin do GP-5/GP-50 faz isso com `isForbiddenFn` em `protocol/constants.ts`, e um teste garante que nenhuma função proibida sai.
- Comece **lendo** (pedidos de estado) antes de **escrever** (alterar efeitos), e escreva no preset de edição antes de gravar na memória (`savePreset`).
- Teste com um preset que você pode perder, e faça backup dos presets do pedal pelo editor oficial antes.
