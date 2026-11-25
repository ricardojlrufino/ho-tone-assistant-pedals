/**
 * Cria `plugins/<id>/` a partir de `templates/pedal/`.
 * Uso: `bun run new <id> "<Nome do pedal>"`  (ex.: `bun run new acme-stomp "Acme Stomp"`)
 */
import { cp, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const [id, name] = process.argv.slice(2)
if (!id || !name || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error('Uso: bun run new <id> "<Nome do pedal>"\n  id: letras minúsculas, números e hífens (ex.: acme-stomp)')
  process.exit(1)
}

const root = join(import.meta.dir, '..')
const target = join(root, 'plugins', id)
if (existsSync(target)) {
  console.error(`plugins/${id} já existe.`)
  process.exit(1)
}

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

await cp(join(root, 'templates/pedal'), target, { recursive: true })
for await (const file of files(target)) {
  if (!/\.(ts|json)$/.test(file)) continue
  const text = await readFile(file, 'utf8')
  await writeFile(file, text.replaceAll('example-pedal', id).replaceAll('Example Pedal', name))
}

console.log(`✓ plugins/${id} criado a partir do template.
Próximos passos:
  1. Edite o "portHint" em plugins/${id}/src/index.ts para casar com o nome da porta MIDI do pedal.
  2. Troque o protocolo fictício (src/protocol/) e o catálogo (src/data/effects.json) pelos do seu pedal.
  3. bun run dev  (recompila a cada mudança) e instale dist/${id}/ no app com o modo desenvolvedor.
Veja docs/primeiros-passos.md.`)
