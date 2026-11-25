/**
 * Compila cada `plugins/<nome>/src/index.ts` num `index.js` autocontido em `dist/<nome>/`, junto do `plugin.json`.
 * Uso: `bun run build` ou `bun run dev` (recompila a cada mudança). Com nomes (`bun run build valeton-gp5-50`), só esses plugins.
 */
import { watch } from 'node:fs'
import { mkdir, readdir, rename, writeFile, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const SOURCES = join(ROOT, 'plugins')
const OUT = join(ROOT, 'dist')

async function buildPlugin(name: string) {
  const result = await Bun.build({
    entrypoints: [join(SOURCES, name, 'src/index.ts')],
    target: 'browser',
    format: 'esm',
    plugins: [
      {
        // O `dataurl` embutido do Bun devolve string vazia; o plugin precisa carregar sem arquivos ao lado.
        name: 'png-data-url',
        setup(build) {
          build.onLoad({ filter: /\.png$/ }, async ({ path }) => ({
            contents: `export default ${JSON.stringify(`data:image/png;base64,${Buffer.from(await Bun.file(path).arrayBuffer()).toString('base64')}`)}`,
            loader: 'js',
          }))
        },
      },
    ],
    throw: false,
  })
  if (!result.success) {
    console.error(`✗ ${name}`, ...result.logs)
    return false
  }
  const out = join(OUT, name)
  await mkdir(out, { recursive: true })
  // Grava à parte e renomeia: quem observa a pasta nunca lê um arquivo pela metade.
  const temp = join(out, '.index.js.tmp')
  await writeFile(temp, await result.outputs[0].text())
  await rename(temp, join(out, 'index.js'))
  await copyFile(join(SOURCES, name, 'plugin.json'), join(out, 'plugin.json'))
  console.log(`✓ dist/${name} (${new Date().toLocaleTimeString()})`)
  return true
}

const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))

async function buildAll() {
  const names = (await readdir(SOURCES)).filter((name) => existsSync(join(SOURCES, name, 'plugin.json')) && (only.length === 0 || only.includes(name)))
  const unknown = only.filter((name) => !names.includes(name))
  if (unknown.length > 0) throw new Error(`Plugin não encontrado em plugins/: ${unknown.join(', ')}`)
  const results = await Promise.all(names.map(buildPlugin))
  return results.every(Boolean)
}

const ok = await buildAll().catch((err: Error) => {
  console.error(err.message)
  return false
})
if (process.argv.includes('--watch')) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = Promise.resolve<unknown>(undefined)
  const rebuild = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      running = running.then(buildAll).catch((err) => console.error(err))
    }, 150)
  }
  // `sdk/` entra porque os plugins reaproveitam seu código (ícones, trechos de prompt).
  for (const dir of [SOURCES, join(ROOT, 'sdk')]) watch(dir, { recursive: true }, rebuild)
  console.log('Observando plugins/ e sdk/… (instale a pasta dist/<plugin> no app com o modo desenvolvedor)')
} else if (!ok) process.exit(1)
