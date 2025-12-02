"use client"

/**
 * LocalStorage cleanup utility
 * Manages localStorage quota by cleaning up old workflow cache entries
 */

const WORKFLOW_CONFIG_PREFIX = 'workflow_'
const CONFIG_SUFFIX = '_config'
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Clean up old workflow config entries from localStorage
 * Removes entries older than MAX_AGE_MS or if quota is exceeded
 */
export function cleanupWorkflowLocalStorage(): void {
  if (typeof window === 'undefined') return

  try {
    const keysToRemove: string[] = []
    const now = Date.now()

    // Find all workflow config entries
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(WORKFLOW_CONFIG_PREFIX) && key.includes('_node_') && key.endsWith(CONFIG_SUFFIX)) {
        try {
          const value = localStorage.getItem(key)
          if (value) {
            const parsed = JSON.parse(value)
            // Remove if older than MAX_AGE_MS or if there's no timestamp
            if (!parsed.timestamp || (now - parsed.timestamp) > MAX_AGE_MS) {
              keysToRemove.push(key)
            }
          }
        } catch {
          // Invalid JSON, remove it
          keysToRemove.push(key)
        }
      }
    }

    // Remove stale entries
    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })

    if (keysToRemove.length > 0) {
      console.debug(`[StorageCleanup] Removed ${keysToRemove.length} stale workflow config entries`)
    }
  } catch (error) {
    // Ignore errors during cleanup
    console.debug('[StorageCleanup] Error during cleanup:', error)
  }
}

/**
 * Force cleanup to make room for new data
 * Removes ALL workflow node config entries regardless of age
 */
export function forceCleanupWorkflowStorage(): void {
  if (typeof window === 'undefined') return

  try {
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(WORKFLOW_CONFIG_PREFIX) && key.includes('_node_') && key.endsWith(CONFIG_SUFFIX)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })

    if (keysToRemove.length > 0) {
      console.debug(`[StorageCleanup] Force removed ${keysToRemove.length} workflow config entries`)
    }
  } catch (error) {
    console.debug('[StorageCleanup] Error during force cleanup:', error)
  }
}

/**
 * Safe localStorage setItem with automatic cleanup on quota exceeded
 * @param key The key to set
 * @param value The value to store (will be JSON stringified if not a string)
 * @returns true if successful, false if failed even after cleanup
 */
export function safeLocalStorageSet(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false

  const stringValue = typeof value === 'string' ? value : JSON.stringify(value)

  try {
    localStorage.setItem(key, stringValue)
    return true
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      // Try cleanup and retry
      cleanupWorkflowLocalStorage()

      try {
        localStorage.setItem(key, stringValue)
        return true
      } catch {
        // Force cleanup and retry one more time
        forceCleanupWorkflowStorage()

        try {
          localStorage.setItem(key, stringValue)
          return true
        } catch {
          // Give up, localStorage is truly full
          console.debug(`[StorageCleanup] Unable to store ${key}, localStorage full`)
          return false
        }
      }
    }
    return false
  }
}

/**
 * Get approximate localStorage usage
 * @returns Object with used bytes and percentage
 */
export function getLocalStorageUsage(): { usedBytes: number; estimatedMaxBytes: number; percentUsed: number } {
  if (typeof window === 'undefined') return { usedBytes: 0, estimatedMaxBytes: 5 * 1024 * 1024, percentUsed: 0 }

  try {
    let usedBytes = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        const value = localStorage.getItem(key)
        // Each character is 2 bytes in UTF-16
        usedBytes += (key.length + (value?.length ?? 0)) * 2
      }
    }

    // Most browsers have 5MB limit
    const estimatedMaxBytes = 5 * 1024 * 1024
    const percentUsed = (usedBytes / estimatedMaxBytes) * 100

    return { usedBytes, estimatedMaxBytes, percentUsed }
  } catch {
    return { usedBytes: 0, estimatedMaxBytes: 5 * 1024 * 1024, percentUsed: 0 }
  }
}
