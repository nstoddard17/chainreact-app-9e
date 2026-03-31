import { useEffect, useRef, useCallback } from 'react'
import { logger } from '@/lib/utils/logger'

const VERSION_CHECK_INTERVAL = 5 * 60 * 1000 // Check every 5 minutes
const VERSION_STORAGE_KEY = 'app_version'

/**
 * Hook that silently checks for new app versions in the background.
 * When a new version is detected, it flags the app as stale.
 * The update is applied passively on the next full page navigation
 * (server component re-renders serve new assets automatically).
 *
 * Chunk error recovery is NOT handled here — that is owned by
 * ChunkErrorHandler (lib/utils/chunkErrorHandler.ts).
 */
export function useVersionCheck() {
  const currentVersionRef = useRef<string | null>(null)
  const hasNewVersionRef = useRef(false)

  // Check for new version
  const checkVersion = useCallback(async () => {
    try {
      const response = await fetch('/api/version', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })

      if (!response.ok) return

      const { version } = await response.json()

      // First check - store the initial version
      if (!currentVersionRef.current) {
        currentVersionRef.current = version
        // Also store in sessionStorage so it persists across soft navigations
        try {
          sessionStorage.setItem(VERSION_STORAGE_KEY, version)
        } catch {
          // sessionStorage might not be available
        }
        return
      }

      // Compare versions
      if (version !== currentVersionRef.current) {
        logger.info('[VersionCheck] New version detected', {
          current: currentVersionRef.current,
          new: version
        })
        hasNewVersionRef.current = true
        // Store the new version for after reload
        try {
          sessionStorage.setItem(VERSION_STORAGE_KEY, version)
        } catch {
          // sessionStorage might not be available
        }
      }
    } catch (error) {
      // Silently fail - don't disrupt user experience
      logger.info('[VersionCheck] Failed to check version', { error })
    }
  }, [])

  // Set up version checking
  useEffect(() => {
    // Try to restore version from sessionStorage
    try {
      const storedVersion = sessionStorage.getItem(VERSION_STORAGE_KEY)
      if (storedVersion) {
        currentVersionRef.current = storedVersion
      }
    } catch {
      // sessionStorage might not be available
    }

    // Initial check
    checkVersion()

    // Set up periodic checking
    const intervalId = setInterval(checkVersion, VERSION_CHECK_INTERVAL)

    // Also check when tab becomes visible (user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [checkVersion])

  return {
    hasNewVersion: hasNewVersionRef.current,
    checkVersion
  }
}
