/**
 * Empacota um plugin para release: compila e gera `release/<id>-<versão>.zip`, com a pasta `<id>/` (plugin.json + index.js) dentro.
 * Uso: `bun run pack <id> [--expect-version <versão>]`
 * O `--expect-version` é o que o workflow de release usa para recusar uma tag que não bate com o plugin.json.
 */
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { parseManifest } from './manifest'

const args = process.argv.slice(2)
const id = args.find((arg) => !arg.startsWith('--'))
const expectAt = args.indexOf('--expect-version')
const expected = expectAt === -1 ? undefined : args[expectAt + 1]
if (!id) {
  console.error('Uso: bun run pack <id> [--expect-version <versão>]')
  process.exit(1)
}

const root = join(import.meta.dir, '..')
const manifestPath = join(root, 'plugins', id, 'plugin.json')
if (!existsSync(manifestPath)) {
  console.error(`Plugin não encontrado: plugins/${id}`)
  process.exit(1)
}
const manifest = parseManifest(await Bun.file(manifestPath).text(), id)
if (expected !== undefined && expected !== manifest.version) {
  console.error(`A tag pede a versão ${expected}, mas plugins/${id}/plugin.json tem ${manifest.version}. Ajuste o plugin.json ou a tag.`)
  process.exit(1)
}

const build = Bun.spawnSync(['bun', join(root, 'scripts/build-plugins.ts'), id], { stdout: 'inherit', stderr: 'inherit' })
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

const out = join(root, 'release')
const zip = join(out, `${id}-${manifest.version}.zip`)
await mkdir(out, { recursive: true })
await rm(zip, { force: true })
const packed = Bun.spawnSync(['zip', '-r', '-X', zip, id], { cwd: join(root, 'dist'), stdout: 'ignore', stderr: 'inherit' })
if (packed.exitCode !== 0) {
  console.error('Falha ao criar o .zip (o comando `zip` está instalado?).')
  process.exit(1)
}
console.log(`✓ ${zip}`)
