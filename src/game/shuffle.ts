export function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    const j = bytes[0]! % (i + 1)
    const current = next[i]!
    next[i] = next[j]!
    next[j] = current
  }
  return next
}

export function pickImposters(
  playerIds: string[],
  impostorCount: number,
): Set<string> {
  const count = Math.min(impostorCount, Math.max(playerIds.length - 1, 0))
  return new Set(shuffle(playerIds).slice(0, count))
}
