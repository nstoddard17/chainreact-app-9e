import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { logger } from '@/lib/utils/logger'

const VERSION_CHECK_INTERVAL = 5 * 60 * 1000 // Check every 5 minutes
const VERSION_STORAGE_KEY = 'app_version'

/**
 * Hook that silently checks for new app versions in the background.
 * When a new version is detected, it stores the new version and
 * applies updates on the next page navigation (Slack-style).
 *
 * Also handles chunk load errors by forcing a reload when old chunks
 * are no longer available after a deployment.
 */
export function useVersionCheck() {
  const router = useRouter()
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

  // Handle navigation - reload if new version is available
  const handleNavigation = useCallback(() => {
    if (hasNewVersionRef.current) {
      logger.info('[VersionCheck] Applying update on navigation')
      // Force a hard reload to get new assets
      window.location.reload()
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

  // Listen for navigation events to apply updates
  useEffect(() => {
    // Override Next.js router push/replace to check for updates
    const originalPush = router.push.bind(router)
    const originalReplace = router.replace.bind(router)

    // We can't directly override router methods, but we can use
    // the beforeunload or popstate events, or intercept link clicks

    // Listen for link clicks
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')

      if (link && link.href && link.href.startsWith(window.location.origin)) {
        if (hasNewVersionRef.current) {
          e.preventDefault()
          logger.info('[VersionCheck] Redirecting to new version', { href: link.href })
          window.location.href = link.href
        }
      }
    }

    // Listen for popstate (back/forward navigation)
    const handlePopState = () => {
      if (hasNewVersionRef.current) {
        window.location.reload()
      }
    }

    document.addEventListener('click', handleClick, true)
    window.addEventListener('popstate', handlePopState)

    return () => {
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [router])

  // Handle chunk load errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = event.message || ''
      const isChunkError =
        message.includes('Loading chunk') ||
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('ChunkLoadError') ||
        message.includes('Loading CSS chunk')

      if (isChunkError) {
        logger.info('[VersionCheck] Chunk load error detected, reloading', { message })
        // Clear the error to prevent console spam
        event.preventDefault()
        // Force reload to get new chunks
        window.location.reload()
      }
    }

    // Also handle unhandled promise rejections (for dynamic imports)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.message || event.reason || ''
      const isChunkError =
        reason.includes('Loading chunk') ||
        reason.includes('Failed to fetch dynamically imported module') ||
        reason.includes('ChunkLoadError')

      if (isChunkError) {
        logger.info('[VersionCheck] Chunk load error in promise, reloading', { reason })
        event.preventDefault()
        window.location.reload()
      }
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return {
    hasNewVersion: hasNewVersionRef.current,
    checkVersion
  }
}
