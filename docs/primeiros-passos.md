# Primeiros passos

## 1. Pré-requisitos

- [Bun](https://bun.sh) (instala, compila e roda os testes).
- Chrome ou Edge. O **modo desenvolvedor** usa a File System Access API, que só esses dois têm; sem ela o plugin ainda instala (por um seletor de pasta comum), mas não recarrega sozinho.
- O app HO-Tone Assistant aberto (produção ou `bun run dev` do app).

```bash
git clone https://github.com/ricardojlrufino/ho-tone-assistant-pedals
cd ho-tone-assistant-pedals
bun install
```

## 2. Criar o plugin a partir do template

```bash
bun run new acme-stomp "Acme Stomp"
```

Isso copia `templates/pedal/` para `plugins/acme-stomp/`, trocando o id e o nome. O template implementa um pedal **fictício** de 4 módulos (DRV, AMP, DLY, RVB), com checksum XOR e valores de 14 bits. Ele já compila e passa nos testes; você troca as partes fictícias pelas do seu pedal:

| Arquivo | O que trocar |
|---|---|
| `src/index.ts` | `portHint` (nome da porta MIDI), `name`, limites de preset, `capabilities`, `ai`. |
| `src/protocol/constants.ts` | Slots, ids de comando, constantes do protocolo. |
| `src/protocol/frame.ts` | Como um frame é montado e validado (cabeçalho, checksum, nibbles, ...). |
| `src/protocol/commands.ts` | Os comandos que o app envia, e `parseIncoming` para o que o pedal avisa sozinho. |
| `src/sync.ts` | Ler o estado do preset ativo e os nomes dos presets. Opcional, mas é o que deixa a tela igual ao pedal. |
| `src/data/effects.json` | O catálogo: efeitos de cada slot e seus parâmetros. |
| `src/example.test.ts` | Testes com os bytes que você capturou. Renomeie o arquivo. |

Comece pelo mínimo: `portHint` + `toggleSlot`. Com isso você já liga e desliga um módulo no pedal e vê o ciclo funcionar; o resto vem aos poucos.

## 3. Ciclo de desenvolvimento

1. Rode `bun run dev` num terminal. Ele gera `dist/acme-stomp/` e recompila a cada gravação em `plugins/` ou `sdk/`. A saída grava em arquivo temporário e renomeia, então o app nunca lê um arquivo pela metade.
2. No app, abra `#plugins` → **Instalar de uma pasta…** → escolha `dist/acme-stomp`. Marque **Modo desenvolvedor: recarregar quando os arquivos da pasta mudarem** e confirme.
3. Edite o código. Em cerca de um segundo o selo **DEV** (canto da tela) mostra "carregado às HH:MM:SS". Se o código tiver erro, o selo fica vermelho com a mensagem e a última versão que funcionou continua em uso.
4. Conecte o pedal por USB. O app escolhe a porta sozinho se o nome casar com o `portHint`.

O que acontece a cada recarga: o editor e o assistente de IA são reiniciados e o estado é lido do pedal de novo. Se você estava no meio de um ajuste no app, ele se perde, mas o pedal não é alterado.

Dicas:

- Depois de reabrir o navegador, o Chrome pode pedir um clique para liberar a pasta de novo ("Liberar acesso à pasta", na tela de plugins).
- Se um plugin deixar o app inutilizável, abra `/?noPlugins#plugins`: nenhum plugin é executado e você pode removê-lo.
- No Linux, o Chrome só enumera as portas MIDI quando a permissão é concedida: plugue o pedal **antes** de abrir a página, ou use o botão de reconectar da tela de conexão.
- O console do navegador mostra o tráfego (`[midi] OUT/IN ...`). Em `window.__pmTraffic` ficam os últimos 400 frames SysEx enviados e recebidos pelo enlace; `copy(JSON.stringify(window.__pmTraffic))` copia tudo.

## 4. Distribuir

`bun run build` gera `dist/<plugin>/` com `plugin.json` e `index.js`, e `bun run pack <id>` gera o `.zip` em `release/`. Para publicar um release de verdade, veja [Publicando um plugin](publicando.md). Quem receber o plugin instala pelo `#plugins`: o app não baixa plugins sozinho de nenhum endereço.

## Próximos passos

- Descobrir o protocolo do pedal: [Capturando o protocolo MIDI](capturando-midi.md).
- Entender cada campo do perfil: [Referência do `DeviceProfile`](device-profile.md).
- Testar antes de plugar: [Testes e validação](testes-e-validacao.md).
