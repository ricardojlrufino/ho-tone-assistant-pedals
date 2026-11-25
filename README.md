# HO-Tone Assistant — Pedais

Plugins de pedais para o HO-Tone Assistant (editor web de pedaleiras com assistente de IA). Cada plugin ensina o app a falar com um pedal: quais módulos e efeitos ele tem, quais bytes SysEx enviar e como ler o estado de volta.

Este repositório tem:

| Pasta | O que é |
|---|---|
| [`plugins/`](plugins) | Plugins prontos. Hoje: [`valeton-gp5-50`](plugins/valeton-gp5-50) (Valeton GP-5 e GP-50, experimental). |
| [`templates/pedal/`](templates/pedal) | Template de um pedal novo, que compila e passa nos testes. |
| [`sdk/`](sdk) | Os tipos do contrato com o app (`DeviceProfile` e companhia) e código compartilhado (ícones, trechos de prompt). |
| [`docs/`](docs) | Guias para quem vai criar um pedal novo. |
| [`scripts/`](scripts) | Build dos plugins e gerador a partir do template. |

## Usar um plugin

Você precisa do [Bun](https://bun.sh) e de um navegador Chrome ou Edge.

```bash
bun install
bun run build        # gera dist/<plugin>/ com plugin.json + index.js
```

No app, abra **Plugins** (`#plugins`) → **Instalar de uma pasta…** e escolha `dist/valeton-gp5-50`. O app guarda uma cópia, então não precisa da pasta depois. Detalhes em [docs/primeiros-passos.md](docs/primeiros-passos.md).

> Um plugin roda dentro da página do app, com acesso a tudo que ela tem (inclusive chaves de IA). Instale só plugins de quem você confia, e leia o código antes.

## Releases

Cada plugin tem os **próprios releases**, independentes dos demais, com um `.zip` por plugin. Baixe em [Releases](https://github.com/ricardojlrufino/ho-tone-assistant-pedals/releases), descompacte e instale a pasta no app. Os releases são criados pelo GitHub Actions a partir de uma tag `<id-do-plugin>-v<versão>`; veja [docs/publicando.md](docs/publicando.md).

## Criar um pedal novo

```bash
bun run new acme-stomp "Acme Stomp"   # cria plugins/acme-stomp a partir do template
bun run dev                           # recompila a cada mudança
```

Instale `dist/acme-stomp` no app marcando **Modo desenvolvedor**: a cada gravação o app recarrega o plugin sozinho, sem recarregar a página, e mostra os erros num selo "DEV". O caminho completo, do primeiro byte capturado ao pedal funcionando, está nos guias:

1. [Primeiros passos](docs/primeiros-passos.md) — instalar, criar a partir do template, ciclo de desenvolvimento.
2. [Capturando o protocolo MIDI](docs/capturando-midi.md) — como descobrir os comandos do pedal com a [midi-sysex-webdebug](https://github.com/ricardojlrufino/midi-sysex-webdebug).
3. [Formato do plugin](docs/formato-do-plugin.md) — `plugin.json`, o módulo `index.js`, versão da API, limites.
4. [Referência do `DeviceProfile`](docs/device-profile.md) — cada campo que o app lê, e o que acontece quando falta.
5. [Testes e validação no pedal](docs/testes-e-validacao.md) — testes com vetores de bytes, enlace simulado, checklist para o primeiro teste em hardware.
6. [Publicando um plugin](docs/publicando.md) — versão, tag e o workflow que cria o release.

## Capturar os comandos do seu pedal

A etapa mais trabalhosa é descobrir o protocolo. A ferramenta [**midi-sysex-webdebug**](https://github.com/ricardojlrufino/midi-sysex-webdebug) ([abrir online](https://ricardojlrufino.github.io/midi-sysex-webdebug/)) captura as mensagens SysEx direto no navegador, reagrupa as fragmentadas, junta as que chegam na mesma ação, deixa rotular cada pacote ("liga o DLY", "preset 5", "Time = 400 ms") e exporta tudo em Markdown ou JSON. Esse arquivo vira a tabela de comandos do seu plugin. Veja [docs/capturando-midi.md](docs/capturando-midi.md).

## Comandos

```bash
bun run build       # compila todos os plugins de plugins/ para dist/
bun run dev         # idem, recompilando a cada mudança em plugins/ e sdk/
bun run new <id> "<Nome>"   # novo plugin a partir do template
bun run pack <id>   # compila e gera release/<id>-<versão>.zip (o que o release publica)
bun run test        # testes dos plugins e do template
bun run typecheck   # tsc --noEmit
```

## Sobre o `sdk/`

`sdk/types.ts` é uma cópia, só de tipos, de `src/devices/types.ts` do app (API 1). Os tipos são apagados na compilação: o plugin não importa nada do app em tempo de execução, e é por isso que o `index.js` é autocontido. Se a API do app mudar, a `apiVersion` sobe e este arquivo é atualizado junto.

## Contribuir

Pedais novos são bem-vindos. Abra um PR com o plugin em `plugins/<id>/`, os testes com os bytes capturados e um `README.md` curto dizendo **o que foi validado em hardware** e o que não foi. Mantenha o badge `experimental` até alguém confirmar no pedal.

Antes de abrir o PR, não inclua firmware, arquivos copiados de editores oficiais nem capturas que contenham dados pessoais. Use só fatos do protocolo (bytes, formatos, nomes de efeitos), escritos com as suas palavras e o seu código.
