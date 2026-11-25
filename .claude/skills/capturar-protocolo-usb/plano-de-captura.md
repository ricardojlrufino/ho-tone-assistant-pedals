# Roteiro de captura

Ordem recomendada. Cada linha é um passo: `bun run mark <sessão> "<rótulo>"`, depois a frase que você diz ao usuário, e o que observar. Adapte os nomes aos módulos e botões do pedal. **Rótulos curtos e fixos**: o `--compare` usa o texto exato.

Em todos os passos: depois do "feito" do usuário, `bun run mark <sessão> --` e `bun run report <sessão> --last`.

## A. Repouso e conexão

| Rótulo | O que dizer | Observar |
|---|---|---|
| `--` | "Não toque em nada por 10 segundos." | Ruído de fundo (sinal de vida) que será filtrado dos demais passos. |
| `abre editor` | "Agora abra o editor oficial do pedal e espere ele carregar." *(só se o objetivo é ver o editor)* | O "aperto de mão" e a leitura inicial do estado: um pedido OUT e respostas IN longas. É o melhor lugar para achar o formato do estado do preset e dos nomes. |

## B. Módulos (liga/desliga) — um módulo de cada vez

Para **cada** módulo da cadeia (anote os nomes que o pedal usa):

| Rótulo | O que dizer |
|---|---|
| `<MOD> liga` | "Ligue o módulo <MOD> (pelo editor, ou pise/aperte no pedal). Só ele." |
| `<MOD> desliga` | "Agora desligue o <MOD>." |

Comparar `liga` × `desliga`: o byte do estado. Comparar módulos diferentes: o byte do endereço do módulo.

## C. Efeito de um módulo

| Rótulo | O que dizer |
|---|---|
| `<MOD> efeito 1 <nome>` | "No módulo <MOD>, escolha o primeiro efeito da lista. **Diga o nome dele.**" |
| `<MOD> efeito 2 <nome>` | "Agora o segundo da lista. Qual o nome?" |
| `<MOD> efeito 3 <nome>` | "O terceiro." |
| `<MOD> efeito último <nome>` | "O último da lista." |

Os códigos devem ser contíguos ou ter um padrão; o último confirma o tamanho do catálogo. Repita em pelo menos **dois módulos** para ver se o código é por módulo ou global. Se for possível, peça também um efeito no meio da lista (para detectar saltos).

## D. Parâmetros

Para um parâmetro de cada tipo (e mais alguns de cada módulo, se der):

| Rótulo | O que dizer |
|---|---|
| `<MOD> <param> mín` | "Gire <PARAM> até o **mínimo**. Diga o valor que aparece no display." |
| `<MOD> <param> máx` | "Agora até o **máximo**. Qual valor?" |
| `<MOD> <param> meio` | "Para o meio. Qual valor?" |
| `<MOD> <param> <valor>` | "Coloque em um valor com casa decimal, por exemplo 12,5. Qual o valor?" *(para saber se o valor é fracionário)* |
| `<MOD> <toggle> liga` / `desliga` | Para botões liga/desliga dentro do efeito. |
| `<MOD> <param> opção 1/2/3` | Para listas (por exemplo, tipo de modulação): cada opção, dizendo o nome. |

Um gesto de gira-gira rápido gera uma **rajada**: peça um passo `<param> arrasto` ("gire devagar de um extremo ao outro, sem parar") só para ver se o pedal aceita muitas mensagens seguidas e se há um comando diferente para "arrastar".

## E. Presets

| Rótulo | O que dizer |
|---|---|
| `preset 1` | "Vá para o preset **1**." *(ou o primeiro que o pedal tem)* |
| `preset 2` | "Agora o **2**." |
| `preset 10` | "O **10**." |
| `preset último` | "O **último** preset do pedal." |
| `preset pelo pedal` | "Agora troque de preset **pisando no pedal**, não pelo editor." *(compare com a troca pelo editor: o que o pedal avisa sozinho)* |

## F. Avisos do pedal (o que ele diz sem ninguém perguntar)

| Rótulo | O que dizer |
|---|---|
| `footswitch módulo` | "Pise no footswitch que liga/desliga um módulo (sem tocar no editor)." |
| `knob` | "Gire um botão físico do pedal, devagar." |
| `preset modificado` | "Mude qualquer parâmetro e **não salve**." *(muitos pedais avisam "preset editado")* |

Mensagens `IN` sem nenhum `OUT` antes são os avisos que o plugin trata em `parseIncoming`.

## G. Nomes e leitura do estado

| Rótulo | O que dizer |
|---|---|
| `ler presets` | "No editor, abra a lista de presets (ou espere ela carregar)." *(procure uma resposta IN longa com os nomes)* |
| `renomear` | "Renomeie o preset para `ABCDEF`." *(só em preset que o usuário pode perder)* |

Peça o nome **exato** e depois outro nome diferente: o campo do nome se identifica pela diferença.

## H. Salvar (somente com autorização explícita)

Pergunte primeiro: "Posso pedir para você salvar um preset? Escolha um que você **possa perder** e faça backup antes." Só então:

| Rótulo | O que dizer |
|---|---|
| `salvar` | "Salve o preset atual no mesmo número." |

Esse comando **grava na memória do pedal**. Capturar é seguro; **enviar depois pelo plugin** só deve ser feito com o pedal descartável.

## Depois de cada bloco

Mostre ao usuário, em uma frase, **o que você já entendeu** ("a mensagem de liga tem 8 bytes e o 5º é o estado: 01 ligado, 00 desligado") e **o que falta**. Se uma hipótese ainda não fechou, peça o passo extra que a decide.

## O que anotar para o PROTOCOLO.md

- Cabeçalho (fabricante/modelo/dispositivo) e se o primeiro byte depois do `F0` é um id do modelo.
- Comandos: liga, efeito, parâmetro, preset, salvar, pedido de estado, resposta de estado, nomes, avisos.
- Como o **valor** é codificado, e a faixa de cada parâmetro com as unidades mostradas no display.
- Checksum: algoritmo e o que ele cobre.
- Tamanhos e quantidade de frames de respostas longas, e se há confirmação (ACK).
- Quanto tempo entre comandos o pedal aguenta (se alguma mensagem foi perdida durante um gira-gira rápido).
