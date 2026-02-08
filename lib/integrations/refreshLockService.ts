/**
 * Distributed Lock Service for Token Refresh
 *
 * Prevents race conditions when multiple cron instances or API calls
 * attempt to refresh the same token simultaneously.
 *
 * Uses database-based locking compatible with Vercel serverless.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/utils/logger"
import { v4 as uuidv4 } from "uuid"

export interface LockResult {
  acquired: boolean
  lockId: string | null
  reason?: string
}

export interface LockInfo {
  integrationId: string
  lockId: string
  acquiredAt: Date
  expiresAt: Date
}

// Default lock duration in seconds
const DEFAULT_LOCK_DURATION = 60

// Maximum time a lock can be held before considered stale
const STALE_LOCK_THRESHOLD_SECONDS = 120

/**
 * Attempt to acquire a distributed lock for token refresh
 *
 * Uses atomic UPDATE with WHERE conditions to ensure only one process
 * can acquire the lock at a time.
 *
 * @param integrationId - The integration to lock
 * @param lockDurationSeconds - How long the lock should be held (default: 60)
 * @returns LockResult with acquired status and lockId if successful
 */
export async function acquireRefreshLock(
  integrationId: string,
  lockDurationSeconds: number = DEFAULT_LOCK_DURATION
): Promise<LockResult> {
  const supabase = createAdminClient()
  if (!supabase) {
    logger.error("[RefreshLock] Failed to create Supabase client")
    return { acquired: false, lockId: null, reason: "database_unavailable" }
  }

  const lockId = uuidv4()
  const now = new Date()
  const staleThreshold = new Date(now.getTime() - STALE_LOCK_THRESHOLD_SECONDS * 1000)

  try {
    // Atomic update: only succeeds if no lock exists or lock is stale
    // This query will only update rows where:
    // 1. refresh_lock_at is NULL (no lock), OR
    // 2. refresh_lock_at is older than stale threshold (stale lock)
    const { data, error } = await supabase
      .from("integrations")
      .update({
        refresh_lock_at: now.toISOString(),
        refresh_lock_id: lockId,
      })
      .eq("id", integrationId)
      .or(`refresh_lock_at.is.null,refresh_lock_at.lt.${staleThreshold.toISOString()}`)
      .select("id, refresh_lock_id")
      .single()

    if (error) {
      // If error is "no rows returned", another process has the lock
      if (error.code === "PGRST116") {
        logger.debug(`[RefreshLock] Lock already held for integration ${integrationId}`)
        return { acquired: false, lockId: null, reason: "lock_held_by_other" }
      }

      logger.error(`[RefreshLock] Error acquiring lock for ${integrationId}:`, error)
      return { acquired: false, lockId: null, reason: "database_error" }
    }

    // Verify our lock was set (not overwritten by concurrent request)
    if (data && data.refresh_lock_id === lockId) {
      logger.debug(`[RefreshLock] Lock acquired for integration ${integrationId} with lockId ${lockId}`)
      return { acquired: true, lockId }
    }

    // Another process beat us to it
    return { acquired: false, lockId: null, reason: "race_condition" }
  } catch (error) {
    logger.error(`[RefreshLock] Exception acquiring lock for ${integrationId}:`, error)
    return { acquired: false, lockId: null, reason: "exception" }
  }
}

/**
 * Release a distributed lock after token refresh completes
 *
 * Only releases if the lockId matches (prevents releasing another process's lock)
 *
 * @param integrationId - The integration to unlock
 * @param lockId - The lockId that was returned from acquireRefreshLock
 */
export async function releaseRefreshLock(
  integrationId: string,
  lockId: string
): Promise<boolean> {
  const supabase = createAdminClient()
  if (!supabase) {
    logger.error("[RefreshLock] Failed to create Supabase client for release")
    return false
  }

  try {
    // Only clear lock if our lockId matches
    const { data, error } = await supabase
      .from("integrations")
      .update({
        refresh_lock_at: null,
        refresh_lock_id: null,
      })
      .eq("id", integrationId)
      .eq("refresh_lock_id", lockId)
      .select("id")
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        // Lock was already released or held by different process
        logger.warn(`[RefreshLock] Lock for ${integrationId} not found or held by different process`)
        return false
      }
      logger.error(`[RefreshLock] Error releasing lock for ${integrationId}:`, error)
      return false
    }

    if (data) {
      logger.debug(`[RefreshLock] Lock released for integration ${integrationId}`)
      return true
    }

    return false
  } catch (error) {
    logger.error(`[RefreshLock] Exception releasing lock for ${integrationId}:`, error)
    return false
  }
}

/**
 * Check if an integration currently has a refresh lock
 *
 * @param integrationId - The integration to check
 * @returns LockInfo if locked, null if not locked
 */
export async function checkLockStatus(integrationId: string): Promise<LockInfo | null> {
  const supabase = createAdminClient()
  if (!supabase) {
    return null
  }

  try {
    const { data, error } = await supabase
      .from("integrations")
      .select("refresh_lock_at, refresh_lock_id")
      .eq("id", integrationId)
      .single()

    if (error || !data || !data.refresh_lock_at || !data.refresh_lock_id) {
      return null
    }

    const acquiredAt = new Date(data.refresh_lock_at)
    const expiresAt = new Date(acquiredAt.getTime() + STALE_LOCK_THRESHOLD_SECONDS * 1000)

    // Check if lock is stale
    if (expiresAt < new Date()) {
      return null // Lock is stale, effectively not locked
    }

    return {
      integrationId,
      lockId: data.refresh_lock_id,
      acquiredAt,
      expiresAt,
    }
  } catch (error) {
    logger.error(`[RefreshLock] Exception checking lock for ${integrationId}:`, error)
    return null
  }
}

/**
 * Clean up stale locks across all integrations
 *
 * Should be called periodically (e.g., at start of cron job) to
 * clear locks from crashed processes.
 *
 * @returns Number of stale locks cleared
 */
export async function cleanupStaleLocks(): Promise<number> {
  const supabase = createAdminClient()
  if (!supabase) {
    return 0
  }

  const staleThreshold = new Date(Date.now() - STALE_LOCK_THRESHOLD_SECONDS * 1000)

  try {
    const { data, error } = await supabase
      .from("integrations")
      .update({
        refresh_lock_at: null,
        refresh_lock_id: null,
      })
      .lt("refresh_lock_at", staleThreshold.toISOString())
      .not("refresh_lock_at", "is", null)
      .select("id")

    if (error) {
      logger.error("[RefreshLock] Error cleaning up stale locks:", error)
      return 0
    }

    const count = data?.length || 0
    if (count > 0) {
      logger.info(`[RefreshLock] Cleaned up ${count} stale locks`)
    }

    return count
  } catch (error) {
    logger.error("[RefreshLock] Exception cleaning up stale locks:", error)
    return 0
  }
}

/**
 * Execute a function with a refresh lock
 *
 * Convenience wrapper that acquires lock, executes function, and releases lock.
 * Lock is always released, even if function throws.
 *
 * @param integrationId - The integration to lock
 * @param fn - The function to execute while holding the lock
 * @returns Result of fn, or null if lock couldn't be acquired
 */
export async function withRefreshLock<T>(
  integrationId: string,
  fn: () => Promise<T>
): Promise<{ success: boolean; result?: T; error?: string }> {
  const lock = await acquireRefreshLock(integrationId)

  if (!lock.acquired || !lock.lockId) {
    return { success: false, error: lock.reason || "lock_not_acquired" }
  }

  try {
    const result = await fn()
    return { success: true, result }
  } catch (error) {
    logger.error(`[RefreshLock] Error executing function for ${integrationId}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "unknown_error"
    }
  } finally {
    await releaseRefreshLock(integrationId, lock.lockId)
  }
}
