export interface FailureTracker {
  consecutiveFailures: number
}

export function recordRunFailure(
  tracker: FailureTracker,
  status: string,
  threshold = 3
): { next: FailureTracker; shouldAlert: boolean } {
  const isFailure = status === "error"
  const consecutiveFailures = isFailure ? tracker.consecutiveFailures + 1 : 0
  return {
    next: { consecutiveFailures },
    shouldAlert: isFailure && consecutiveFailures >= threshold,
  }
}
