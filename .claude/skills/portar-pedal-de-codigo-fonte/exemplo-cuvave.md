# Exemplo: Cuvave (M-VAVE) Cube Baby a partir do CubeControl

Caso real para ilustrar o skill. Os fatos abaixo vêm da **listagem pública do repositório** em 25/11/2026; os arquivos de protocolo **ainda não foram lidos**. Confirme tudo ao ler o código (Fase 2 em diante).

## O que a origem é

- **Repositório**: <https://github.com/MrGariZack/cubecontrol-app>, "CubeControl (tonehub-app)": editor não oficial, de código aberto, para o M-VAVE / Cuvave **CUBE Baby**. Monorepo `pnpm`, TypeScript.
- **Licença**: MIT (arquivo `LICENSE` na raiz). Regime da Fase 1: pode portar com atribuição; reescreva em código próprio e **não copie** ícones, imagens nem arquivos de preset.
- **Plataformas**: desktop (Electron + React) e Android (Expo, com USB-OTG).
- **Transporte** (segundo `packages/midi-host-android/README.md`): **USB-MIDI**, VID `0x301A`, PID `0x5555`; "Bluetooth fica fora". A camada Android entrega os pedaços crus de SysEx fragmentado, sem montar a mensagem.
- **Onde o protocolo não está**: o README diz que o app usa pacotes `@tonehub/*` de um **repositório irmão**, <https://github.com/MrGariZack/cubecontrol> (pasta local `../Tonehub`). Enquadramento, comandos e tabelas de efeitos **não** estão em `cubecontrol-app`. Esse é o repositório que a Fase 2 precisa ler.
- **Segurança**: o app tem `apps/desktop/SAFETY.md` e `apps/desktop/src/safety/`, e o README avisa que o "escritor USB" é experimental e que envio de IR sobrescreve o gabinete. É a primeira fonte para a **lista proibida** da Fase 5.

## Como seguir o skill neste caso

1. **Fase 0**: pergunte ao usuário o id (sugestão `cuvave-cube-baby`) e peça (ou clone, em pasta separada) o repositório do núcleo `MrGariZack/cubecontrol`.
2. **Fase 1**: registre os dois commits e as duas licenças (confira a do núcleo; não presuma que seja a mesma).
3. **Fase 2**: nos dois repositórios, procure `sysex`, `0xF0`, `checksum`, `UUID`, `301A`, `effects`. Pontos de partida prováveis (ainda não verificados): `apps/mobile/src/device/usbConnect.ts` (conexão e identificação), `apps/desktop/electron/` (USB no processo principal), `apps/desktop/src/music/` e `apps/mobile/src/music/`, e os pacotes `@tonehub/*` do núcleo (enquadramento, comandos, catálogos).
4. **`portHint`**: não está no que foi lido. Descubra o nome da porta MIDI que o Windows mostra para o VID/PID `301A:5555` (use o skill `capturar-protocolo-usb`, Fase 1, passo 5) e escreva uma expressão **específica**, por exemplo `/cube[ -]?baby/i`, depois de ver o nome real.
5. **Escopo**: o app fala de "A/B/C ao vivo", setlists e envio de IR do "Cab 8". A primeira versão do plugin deve cobrir o que a interface de pedais do HO-Tone entende (módulos, efeitos, parâmetros, presets); setlists, A/B/C e envio de IR **ficam de fora** e entram no README como não suportados (envio de IR em particular é gravação na memória do pedal).
6. **Validação**: o hardware é USB-MIDI, então o encaixe no `MidiLink` é natural; ainda assim, o plugin sai com `badge: 'experimental'` até alguém testar no pedal.

## O que eu perguntaria ao usuário antes de seguir

- Você tem o Cube Baby para testar? (define se dá para confirmar com a captura.)
- Pode apontar o repositório `cubecontrol` (núcleo) ou prefere que eu o baixe só para leitura?
- Qual o nome da porta MIDI que o Windows mostra para o pedal?
