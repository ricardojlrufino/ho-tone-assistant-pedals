# Testes e validação no pedal

Sem o pedal na mão você valida os **bytes**. Com ele, valida a **conversa**. Faça os dois, nessa ordem.

```bash
bun run test        # vitest: plugins/*/src/**/*.test.ts e templates/*/src/**/*.test.ts
bun run typecheck   # tsc --noEmit
```

## 1. Vetores de bytes

O teste mais útil é o mais simples: um pacote **capturado de verdade** ao lado da função que deveria produzi-lo (veja [Capturando o protocolo MIDI](capturando-midi.md)).

```ts
it('seleciona o preset 3', () => {
  expect(Array.from(buildSelectPreset(3)[0])).toEqual([0xf0, 0x7d, 0x01, 0x02, 0x02, 0x02, 0xf7])
})
```

Cubra, no mínimo:

- cada comando, com valores nos **extremos** (mínimo e máximo) e no meio;
- o enquadramento: checksum correto e pacote corrompido recusado (`parseFrame` devolve `null`);
- argumentos fora da faixa lançando `RangeError`;
- que **nenhum** comando proibido (firmware, reset...) é produzido;
- `parseIncoming` com mensagens reais, e com lixo (devolve `null`, sem exceção).

## 2. Catálogo

Um teste de consistência pega a maioria dos erros de digitação do `effects.json`:

- todo slot do perfil tem efeitos;
- `effectCode` único dentro do slot;
- `index` de parâmetro único dentro do efeito e dentro da faixa do protocolo;
- `default` dentro de `min`/`max`; no `dropdown`, `default` é uma das `options`.

O `templates/pedal/src/example.test.ts` e o do GP-5/GP-50 têm exemplos.

## 3. Leitura com enlace simulado

`MidiLink` é uma interface pequena (`send` + `subscribe`), então um mock responde ao pedido de estado com bytes capturados e você testa `readState` sem hardware. Veja `mockLink` nos dois arquivos de teste citados. Teste também o **timeout** (nenhuma resposta → rejeita) e uma resposta de **outro modelo** (rejeita com mensagem útil, como o GP-5 faz quando recebe o corpo de um GP-50).

## 4. Validação do perfil como o app a faz

Para ter certeza de que o app vai aceitar o plugin, importe o `dist/<id>/index.js` pelo próprio app em `#plugins`: erros de validação aparecem ali com a causa. Mudanças de contrato só aparecem no app, por isso instale sempre a versão compilada ao menos uma vez antes de abrir um PR.

## 5. Primeiro teste no pedal

Faça nesta ordem e anote o resultado de cada item. **Só leitura primeiro**, e mexa no que dá para desfazer.

1. Faça backup dos presets pelo editor oficial.
2. Plugue o pedal **antes** de abrir o app (Linux). Confirme que a porta e o perfil foram detectados (o nome do pedal aparece no seletor, travado como "detectado").
3. Com o selo **DEV** ativo, observe o console: `[midi] IN ...` quando você mexe no pedal.
4. **Leitura**: conectar deve preencher a cadeia (módulos ligados, efeitos, valores). Compare com o display do pedal em 3 presets.
5. **Avisos do pedal**: troque o preset e ligue/desligue um módulo pelo pedal. A tela acompanha?
6. **Escrita, um comando por vez**: liga/desliga → trocar efeito → um parâmetro → trocar preset. Confirme cada um no pedal.
7. **Rajada**: arraste um slider rápido. O pedal acompanha sem perder comandos? Se perde, aumente `sendGapMs`; se perde o último, revise `coalesceKey`.
8. **Salvar** por último, num preset descartável, e releia.
9. Registre no README do plugin o que foi validado e em qual firmware. Mantenha o badge `experimental` enquanto isso não estiver completo.

Se algo falhar, `copy(JSON.stringify(window.__pmTraffic))` no console copia os últimos 400 frames enviados e recebidos; anexe ao issue.
