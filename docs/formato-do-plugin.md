# Formato do plugin

Um plugin é uma **pasta** com dois arquivos:

```
meu-plugin/
├── plugin.json   # manifesto
└── index.js      # ES module autocontido
```

O `bun run build` gera essa pasta em `dist/<id>/` a partir de `plugins/<id>/src/index.ts`.

## plugin.json

```json
{
  "id": "acme-stomp",
  "name": "Acme Stomp",
  "version": "0.1.0",
  "apiVersion": 1,
  "entry": "index.js",
  "description": "Controle e leitura de preset do Acme Stomp (experimental).",
  "devices": ["acme-stomp"]
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `id` | sim | Letras minúsculas, números e hífens. É a identidade do plugin: instalar de novo um plugin com o mesmo `id` **atualiza** o instalado. |
| `name` | sim | Nome mostrado na tela de plugins. |
| `version` | sim | Texto livre (sugestão: semver). Aparece na tela de plugins e na confirmação de atualização. |
| `apiVersion` | sim | Tem de ser igual à API que o app aceita (hoje **1**). Outro valor é recusado com uma mensagem clara. |
| `entry` | não | Arquivo `.js` ou `.mjs` na **raiz** da pasta. Padrão `index.js`. |
| `description` | não | Uma frase. |
| `devices` | não | Só informativo. |

## index.js

Um ES module com **`export default`** de uma função (pode ser `async`) que devolve uma lista de `DeviceProfile`, um por pedal. Um plugin pode trazer vários modelos (o GP-5 e o GP-50 compartilham código).

```ts
import type { DeviceProfile } from '../../../sdk/types'

export default function createProfiles(): DeviceProfile[] {
  return [acmeStompProfile]
}
```

O app chama a função a cada carga e a cada recarga do modo desenvolvedor, então **crie os perfis dentro dela** (ou garanta que o módulo não guarda estado que atrapalhe uma segunda chamada).

### Restrições

- **Autocontido**: o `index.js` é carregado como módulo a partir de um `blob:`, sem endereço-base. `import './outro.js'` ou `import 'lodash'` **não resolve**. O build (`Bun.build`) já junta tudo num arquivo, incluindo o JSON do catálogo e as imagens (PNG vira data URL).
- **Só tipos vêm do app**: `import type { ... } from '.../sdk/types'` é apagado na compilação. Importar valores do app não é possível, e é por isso que `sdk/shared/` existe, como uma cópia de código útil.
- **Sem estado entre cargas** e **sem `window` global** como canal com o app: o contrato é o perfil devolvido.
- Tamanho: o plugin fica no IndexedDB e é executado a cada abertura do app. Imagens grandes pesam; prefira SVG ou data URL pequenas (o GP-5/GP-50 embute 12 PNGs de ~15 KB).

## Validação na carga

O app confere o que devolveu antes de usar e recusa (com mensagem) um plugin que:

- não tem `export default` função, ou devolve lista vazia;
- tem perfil sem `id`, `name`, `slots`, `capabilities`, `commands.{toggleSlot,selectPreset,selectEffect,setParameter}`, `getEffects` ou `findEffect`;
- tem `portHint` que não é `RegExp`, ou com as flags `g`/`y` (tornariam `.test()` com estado);
- declara `capabilities.ai` sem o bloco `ai` completo;
- tem `sync` incompleto (precisa das 4 funções obrigatórias);
- repete slot, ou `getEffects(slot)` não devolve lista, ou algum efeito sem `effectCode`/`name`/`parameters`;
- usa um `id` de pedal que já existe no app ou em outro plugin.

A validação **não** testa o comportamento: um `commands.toggleSlot` que devolve bytes errados passa. Para isso servem os testes.

## Segurança

O plugin roda **na página do app**, sem isolamento. Ele pode enviar qualquer coisa ao pedal e ler o que a página guarda (por exemplo, chaves de provedores de IA). Por isso:

- a tela de instalação mostra um aviso e pede confirmação;
- o app não baixa plugins sozinho;
- `?noPlugins` abre o app sem executar nenhum plugin, para remover um que trave.

Como autor, não use `eval`, não faça requisições de rede e não leia `localStorage`. Se isso mudar um dia (plugins hospedados, loja), o formato ganha permissões e a `apiVersion` sobe.

## Versão da API

`apiVersion` sobe quando o `DeviceProfile` muda de forma incompatível (campo renomeado, função com outra assinatura). Mudanças só aditivas (campo opcional novo) **não** sobem a versão. Atualize `sdk/types.ts` junto com o app e aumente `apiVersion` no `plugin.json` de cada plugin.
