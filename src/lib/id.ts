/**
 * Opaque, sortable-ish unique IDs. Uses the platform UUID when available and
 * falls back to a timestamp+random scheme on older engines.
 */
export function newId(prefix = ''): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : fallbackUuid()
  return prefix ? `${prefix}_${uuid}` : uuid
}

function fallbackUuid(): string {
  const rnd = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1)
  return `${rnd()}${rnd()}-${rnd()}-${rnd()}-${rnd()}-${rnd()}${rnd()}${rnd()}`
}
