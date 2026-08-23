/** Maps a normalized audio level to the Runtime's 0..1 mouthOpen parameter. */
export function audioLevelToMouthOpen(level: number): number {
  if (!Number.isFinite(level)) return 0
  const normalized = Math.max(0, Math.min(1, (level - 0.012) * 8.5))
  return Math.sqrt(normalized)
}

/** Applies a fast attack and slower release so speech stays responsive but stable. */
export function smoothMouthOpen(
  previous: number,
  target: number,
  deltaMs: number,
): number {
  const safeDeltaMs = Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0)
  const timeMs = target > previous ? 32 : 95
  const alpha = 1 - Math.exp(-safeDeltaMs / timeMs)
  return previous + (target - previous) * alpha
}
