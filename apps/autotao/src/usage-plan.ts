import type { GateState, UsageTank } from "./protocol.ts"

export interface TankRunway {
  tank: UsageTank
  paceAt: number
  nextRunFits: boolean
  paced: boolean
  headroom: number | null
}

export interface UsageRunway {
  primary: TankRunway | null
  tanks: TankRunway[]
  nextRunFits: boolean
}

export function paceAt(tank: UsageTank, pace: GateState["policy"]["pace"], nowMs = Date.now()): number {
  if (pace === "eager" || tank.resetAt == null || tank.windowMinutes == null) return tank.finishAt
  const resetMs = tank.resetAt * 1000
  const startMs = resetMs - tank.windowMinutes * 60_000
  if (resetMs <= startMs) return tank.finishAt
  const elapsed = Math.max(0, Math.min(1, (nowMs - startMs) / (resetMs - startMs)))
  return tank.finishAt * elapsed
}

export function usageRunway(gate: GateState, nowMs = Date.now()): UsageRunway {
  const tanks = gate.tanks
    .filter((tank) => tank.governed)
    .map((tank): TankRunway => {
      const limit = paceAt(tank, gate.policy.pace, nowMs)
      const projected = tank.projected
      return {
        tank,
        paceAt: limit,
        // Match usage.sh exactly: equality is refused so the estimated burn cannot land
        // on the launch ceiling and consume the watchdog's overshoot margin.
        nextRunFits: projected != null && projected < Math.min(limit, tank.ceiling ?? limit),
        paced: gate.policy.pace === "even" && tank.resetAt != null && tank.windowMinutes != null,
        headroom: projected == null ? null : limit - projected,
      }
    })

  const known = tanks.filter((runway) => runway.headroom != null)
  const primary = known.sort((left, right) => (left.headroom ?? 0) - (right.headroom ?? 0))[0] ?? tanks[0] ?? null
  return {
    primary,
    tanks,
    nextRunFits: tanks.length > 0 && tanks.every((runway) => runway.nextRunFits),
  }
}

export function resetLabel(tank: UsageTank, nowMs = Date.now()): string {
  if (tank.resetAt == null) return "reset time unavailable"
  const reset = new Date(tank.resetAt * 1000)
  const remainingMs = reset.getTime() - nowMs
  if (remainingMs <= 0) return "resetting now"
  const hours = Math.floor(remainingMs / 3_600_000)
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000)
  if (hours < 24) return `resets in ${hours}h ${minutes}m`
  return `resets ${reset.toLocaleDateString(undefined, { weekday: "short" })} ${reset.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
}
