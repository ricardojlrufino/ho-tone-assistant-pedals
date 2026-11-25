/** Ícone SVG (data URL) com o rótulo do módulo, para pedais que ainda não têm arte própria. */
export function slotIcon(label: string, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="6" y="6" width="84" height="84" rx="14" fill="#10161f" stroke="${color}" stroke-width="4"/>` +
    `<text x="48" y="58" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="700" fill="${color}">${label.replace(/[<&]/g, '')}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
