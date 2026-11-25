# Publicando um plugin

Cada plugin é publicado **separadamente**: um release por plugin e por versão, com um único arquivo, `<id>-<versão>.zip`. Publicar o `valeton-gp5-50` não mexe nos releases de nenhum outro plugin.

## Como publicar

1. Suba a `version` em `plugins/<id>/plugin.json` (sugestão: [semver](https://semver.org/lang/pt-BR/)) e faça o merge na branch principal.
2. Crie e envie a tag `<id>-v<versão>`:

   ```bash
   git tag valeton-gp5-50-v0.2.0
   git push origin valeton-gp5-50-v0.2.0
   ```

3. O workflow [`release.yml`](../.github/workflows/release.yml) roda sozinho e:
   - separa o id do plugin e a versão a partir do nome da tag (o id é tudo antes do último `-v`);
   - roda `typecheck` e os testes;
   - compila **só esse plugin** e confere que a versão da tag é a do `plugin.json` (se não for, o release **não** é criado);
   - cria o release no GitHub, chamado "Nome do plugin versão", com o `.zip` anexado, a descrição do plugin, as instruções de instalação e as notas geradas automaticamente.

Uma versão com sufixo (`0.3.0-beta.1`) é publicada como **pré-lançamento**.

## Testar o pacote antes

```bash
bun run pack valeton-gp5-50 --expect-version 0.2.0
unzip -l release/valeton-gp5-50-0.2.0.zip
```

É o mesmo comando que o workflow roda. O `.zip` contém a pasta `<id>/` com `plugin.json` e `index.js`; essa pasta é o que se escolhe em **Instalar novo Pedal** no app.

## Erros comuns

| Mensagem | Causa |
|---|---|
| "A tag pede a versão X, mas plugins/<id>/plugin.json tem Y" | A tag e o `plugin.json` divergem. Apague a tag (`git push --delete origin <tag>`, `git tag -d <tag>`), corrija e crie de novo. |
| "Plugin não encontrado: plugins/<id>" | O prefixo da tag não é o nome de uma pasta em `plugins/`. |
| "O "id" (...) tem de ser igual ao nome da pasta" | O `id` do `plugin.json` difere do nome da pasta do plugin. |

## CI

O workflow [`ci.yml`](../.github/workflows/ci.yml) roda `typecheck`, testes e build em todo push na branch principal e em todo pull request.

## Para quem baixa

O app tem o link para os releases na tela **Instalar novo Pedal**. Ele **não** baixa nem atualiza plugins sozinho: o usuário baixa o `.zip`, descompacta e escolhe a pasta, e reinstalar uma versão nova do mesmo plugin atualiza o instalado.
