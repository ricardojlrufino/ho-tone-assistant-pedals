export interface Manifest {
  id: string
  name: string
  version: string
  description?: string
}

/** Confere o mínimo que o empacotamento precisa; a validação completa é a do app (veja docs/formato-do-plugin.md). */
export function parseManifest(text: string, folder: string): Manifest {
  const raw = JSON.parse(text) as Partial<Manifest>
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.version !== 'string') {
    throw new Error(`plugins/${folder}/plugin.json precisa de "id", "name" e "version".`)
  }
  if (raw.id !== folder) throw new Error(`O "id" (${raw.id}) tem de ser igual ao nome da pasta (plugins/${folder}).`)
  return raw as Manifest
}
