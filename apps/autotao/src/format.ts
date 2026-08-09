export function duration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—"
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function bytes(value: number | null): string {
  if (value == null) return "—"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}

export function truncate(value: string, width: number): string {
  if (value.length <= width) return value
  return `${value.slice(0, Math.max(0, width - 1))}…`
}

export function bar(value: number | null, max: number | null, width = 18): string {
  if (value == null || max == null || max <= 0) return "─".repeat(width)
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)))
  return `${"━".repeat(filled)}${"─".repeat(width - filled)}`
}
