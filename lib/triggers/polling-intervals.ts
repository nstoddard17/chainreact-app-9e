/**
 * Shared polling interval constants (client-safe, no server dependencies).
 * Used by the polling indicator UI and can optionally replace per-poller constants.
 */

export const PLAN_POLL_INTERVALS: Record<string, { ms: number; label: string }> = {
  free:       { ms: 15 * 60 * 1000, label: '15 minutes' },
  pro:        { ms: 2 * 60 * 1000,  label: '2 minutes' },
  'beta-pro': { ms: 2 * 60 * 1000,  label: '2 minutes' },
  team:       { ms: 2 * 60 * 1000,  label: '2 minutes' },
  business:   { ms: 60 * 1000,      label: '1 minute' },
  enterprise: { ms: 60 * 1000,      label: '1 minute' },
  admin:      { ms: 60 * 1000,      label: '1 minute' },
}

export const DEFAULT_POLL_INTERVAL = { ms: 15 * 60 * 1000, label: '15 minutes' }

export function getPollingIntervalLabel(plan: string): string {
  return (PLAN_POLL_INTERVALS[plan] || DEFAULT_POLL_INTERVAL).label
}

export function isMaxPollingTier(plan: string): boolean {
  const interval = PLAN_POLL_INTERVALS[plan] || DEFAULT_POLL_INTERVAL
  return interval.ms <= 60 * 1000
}
