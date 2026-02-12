"use client"

import { useVersionCheck } from '@/hooks/useVersionCheck'

/**
 * Silent background version checker.
 * Detects new deployments and applies updates on next navigation (Slack-style).
 * Renders nothing - just runs the version check logic in the background.
 */
export function VersionChecker() {
  useVersionCheck()
  return null
}
