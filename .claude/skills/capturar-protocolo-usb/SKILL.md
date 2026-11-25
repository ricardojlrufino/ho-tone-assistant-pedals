---
name: capturar-protocolo-usb
description: Conduz, em tempo real, a captura do protocolo USB-MIDI/SysEx de um pedal no Windows com Wireshark (tshark + USBPcap). O agente lê o barramento ao vivo e vai dizendo ao usuário o que fazer no pedal, passo a passo, rotulando cada mensagem. Use quando o usuário quiser descobrir, capturar, "sniffar" ou documentar os comandos de um pedal (engenharia reversa do protocolo) para criar um plugin, ou pedir ajuda com Wireshark/USBPcap/SysEx.
---

# Captura guiada do protocolo USB (Windows)

Você **conduz** a captura: lê o USB ao vivo, diz ao usuário uma ação por vez, confere o que chegou e só então passa para a próxima. O usuário só mexe no pedal e responde "feito". Tudo é **somente leitura**: a captura nunca envia nada ao pedal.

Ferramentas (já neste repositório, em `scripts/capture/`):

| Comando | Para quê |
|---|---|
| `scripts\capture\capture.cmd list` | Lista as interfaces do Wireshark (`USBPcap1`, `USBPcap2`...). |
| `scripts\capture\capture.cmd <N> <sessão> [--list] [--device D] [--endpoint E] [--mode raw]` | Captura ao vivo da interface `USBPcapN`: grava `captures/<sessão>/raw.pcapng` (cópia fiel) e `events.jsonl` (uma linha por mensagem, na hora) e imprime cada mensagem decodificada. |
| `bun run mark <sessão> "<ação>"` | Marca o que o usuário vai fazer agora. `--` = repouso. |
| `bun run report <sessão> --last` | Mensagens do passo atual, já sem o ruído do repouso. |
| `bun run report <sessão> --compare "A" "B"` | Quais bytes mudam entre dois passos. |
| `bun run report <sessão> --out arquivo.md` | Relatório completo em Markdown. |
| `bun scripts/capture/demo.ts \| bun scripts/capture/live.ts ensaio` | Pedal de mentira para treinar o fluxo sem hardware. |

O roteiro padrão de ações está em [plano-de-captura.md](plano-de-captura.md). Leia-o antes de começar e adapte aos módulos do pedal.

## Regras de condução

1. **Uma ação por vez.** Sempre: `mark` com o rótulo → peça a ação em **uma frase curta** → espere o usuário dizer "feito" → `mark --` → `report --last` → conte o que viu em uma frase e diga o próximo passo.
2. **Marque antes de pedir.** Uma mensagem sem marca anterior não tem rótulo e não serve.
3. **Mude uma coisa só entre passos comparáveis** (ligar ×desligar o mesmo módulo; o mesmo parâmetro em valores diferentes). É a comparação desses pares que revela os campos.
4. **Repita o que ficou vazio ou ambíguo** (nenhuma mensagem nova, ou várias). Peça de novo, mais devagar, sem tocar em mais nada.
5. **Nunca reenvie o que capturou** ao pedal, nem peça ao usuário para usar ferramentas que enviem. Se ele começar uma atualização de firmware, restauração de fábrica ou formatação durante a captura, **peça para parar**: isso não é para capturar.
6. Fale com o usuário em português, sem jargão desnecessário ("gire o botão GAIN até o máximo", não "varie o parâmetro 3").

## Antes de começar (pré-requisitos no Windows)

Confira com o usuário, uma coisa por vez:

- **Wireshark com USBPcap.** No instalador do Wireshark, a opção *USBPcap* tem de estar marcada; depois de instalar é preciso **reiniciar o Windows**. Teste: `scripts\capture\capture.cmd list` deve mostrar `USBPcap1` (ou mais). Se só aparecem Wi-Fi/Ethernet, o USBPcap não foi instalado: reinstale o Wireshark marcando a opção.
- **Bun** instalado (`bun --version`) e `bun install` feito neste repositório.
- **Permissão.** O USBPcap normalmente exige um terminal **como administrador**, a menos que o instalador tenha sido usado sem a opção "restringir acesso a administradores". Se aparecer "acesso negado" ou nenhum pacote, abra o terminal como administrador.
- **Ferramentas do fabricante.** Se o objetivo é ver o que o *editor oficial* manda, ele precisa estar instalado, e o pedal, ligado por USB (cabo de dados). Se o objetivo é só ver o que o pedal avisa sozinho (pedaleira, botões), o editor oficial **não deve** estar aberto.
- Anote o **nome da pasta da sessão**: `<pedal>-<AAAAMMDD>` (por exemplo `cuvave-baby-20261125`).

Ensaio rápido (recomendado na primeira vez): `bun scripts/capture/demo.ts | bun scripts/capture/live.ts ensaio` e, em outro terminal, `bun run mark ensaio "teste"` e `bun run report ensaio --last`. Mostra ao usuário como as mensagens aparecem.

## Fase 1 — Achar o pedal no barramento

Cada porta USB do computador pertence a uma interface `USBPcapN`, e o número do dispositivo muda a cada vez que ele é plugado. Para achar o pedal:

1. Rode a captura em modo lista, em segundo plano (Bash com `run_in_background`, redirecionando a saída para um arquivo que você vai ler):
   `scripts\capture\capture.cmd 1 achar --list` (troque `1` pelas interfaces da lista, uma de cada vez).
2. Peça: "**Gire um botão do pedal e pise num footswitch, devagar, por uns 10 segundos.**" (Com o editor oficial aberto, peça também para trocar um preset por lá.)
3. Leia a saída. O pedal é o **dispositivo que acumula pacotes `bulk` ou `interrupt`** (um endpoint IN e, se o editor estiver ativo, um OUT) enquanto o usuário mexe. Teclado e mouse aparecem como `interrupt IN` em outras interfaces: ignore os que não reagem ao pedal.
4. Encerre (Ctrl+C / `TaskStop`) e anote **interface, dispositivo e endpoints**. Se nenhuma interface mostrar tráfego: veja "Problemas".
5. Peça ao usuário o **nome da porta MIDI** que o sistema mostra para o pedal (no Chrome: a página da ferramenta [midi-sysex-webdebug](https://ricardojlrufino.github.io/midi-sysex-webdebug/) lista as portas; ou Gerenciador de Dispositivos → *Controladores de som, vídeo e jogos*) e o **VID/PID** (Gerenciador de Dispositivos → Propriedades → Detalhes → *IDs de hardware*, `USB\VID_xxxx&PID_xxxx`). O plugin usa o nome da porta no `portHint`; o VID/PID vai para o `PROTOCOLO.md`.

## Fase 2 — Captura de verdade

Inicie, em segundo plano, **com o dispositivo fixado**:
`scripts\capture\capture.cmd <N> <sessão> --device <D>`
(`--mode raw` se na Fase 1 os dados **não** vieram como USB-MIDI, isto é, se aparecem como `RAW`; veja "Problemas".)

O número do dispositivo muda se o pedal for desplugado e plugado de novo: nesse caso, refaça a Fase 1.

Depois siga o roteiro (**[plano-de-captura.md](plano-de-captura.md)**) na ordem. Primeiro um **repouso de 10 s** (`bun run mark <sessão> --`), que ensina o relatório quais mensagens são só ruído de fundo (por exemplo, sinais de "estou vivo" do pedal) e as tira dos passos.

Enquanto captura, leia o arquivo de saída ou use `bun run report <sessão> --last` depois de cada ação. Se o usuário perguntar "funcionou?", responda com os bytes que viu.

## Fase 3 — Analisar (você, com o usuário por perto)

1. `bun run report <sessão>` para ver tudo de uma vez.
2. Para cada par comparável: `bun run report <sessão> --compare "liga DLY" "desliga DLY"`. O byte que muda é o campo "ligado"; o resto é o endereçamento do módulo.
3. Monte a tabela de campos do protocolo: o que é **constante** (cabeçalho: SysEx começa com `F0`, depois o id do fabricante e do modelo), **comando**, **índice** (módulo, parâmetro, preset), **valor** (como é codificado: 1 byte, 14 bits em dois bytes de 7 bits, nibbles, float em bytes de 7 bits), **checksum** (últimos bytes antes do `F7`).
4. **Para achar o checksum**, teste as hipóteses com os bytes capturados (um script rápido em `bun`): XOR dos dados, soma módulo 128 (e seu complemento, como na Roland), CRC-8, com e sem cabeçalho. A hipótese certa tem de bater em **todas** as mensagens, não só numa.
5. Se uma hipótese precisa de mais evidência, peça um passo extra ao usuário (por exemplo, o mesmo parâmetro em três valores diferentes) em vez de adivinhar.
6. Valores com fração, ou escalas (ms, dB, Hz), saem de passos com o valor lido no display do pedal: peça ao usuário que **diga o valor que o pedal mostra** em cada passo e anote junto.

## Fase 4 — Entregar

1. `bun run report <sessão> --out captures/<sessão>/relatorio.md`.
2. Escreva `plugins/<id>/PROTOCOLO.md` com: pedal e firmware, VID/PID, nome da porta, enquadramento, checksum, tabela de comandos (com os bytes de exemplo capturados), formato das respostas, avisos que o pedal envia sozinho, o que **não** foi capturado, e comandos perigosos que apareceram (para o plugin proibir).
3. Os pacotes rotulados viram **testes** (`docs/testes-e-validacao.md`): bytes capturados ao lado da função que os produz.
4. Próximo passo: `bun run new <id> "<Nome>"` e o template. Se o usuário já tem o código-fonte de um editor para esse pedal, use também o skill `portar-pedal-de-codigo-fonte`.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `capture.cmd list` não mostra `USBPcapN` | USBPcap não instalado ou Windows não reiniciado depois da instalação. |
| "Acesso negado" / nenhum pacote | Terminal como administrador. |
| Tráfego só no `--list`, nada no modo normal | Faltou `--device` correto (o número muda ao replugar). |
| As mensagens saem como `RAW`, não `SYSEX` | O pedal não usa USB-MIDI padrão (protocolo próprio, HID ou bulk de fabricante). Rode com `--mode raw` e trate cada transferência como um frame; o plugin precisa de **SysEx sobre MIDI**, então registre isso no relatório: pode não ser suportado ainda. |
| Muitas mensagens iguais o tempo todo | Normal: sinal de vida do pedal. O repouso (`--`) as filtra; capture 10 s de repouso. |
| Nada aparece quando o usuário mexe | O pedal não avisa; só responde a pedidos. Use o editor oficial para provocar tráfego (OUT e IN). |
| Wireshark antigo recusa `-t e` ou `-P` | Atualize o Wireshark (versão 3.6 ou mais nova). |
| Quer outro formato de dados | O `raw.pcapng` guarda tudo; abra no Wireshark para inspecionar. |

## Privacidade

`captures/` fica fora do Git (`.gitignore`). O `raw.pcapng` e os JSON podem conter número de série, nome do computador ou presets pessoais do usuário. **Revise antes de compartilhar** e publique só os bytes necessários para o protocolo (no `PROTOCOLO.md` e nos testes).
