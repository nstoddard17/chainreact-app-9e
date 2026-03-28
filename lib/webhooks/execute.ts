/**
 * Unified Webhook Workflow Execution
 *
 * Single entry point for all webhook-triggered workflow execution.
 * All provider webhook routes should use this instead of implementing
 * their own execution logic.
 *
 * Includes built-in deduplication to prevent duplicate workflow runs
 * when providers retry webhook deliveries.
 *
 * Creates a trackable execution session via AdvancedExecutionEngine.
 */

import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'
import { logger } from '@/lib/utils/logger'

export interface WebhookExecutionParams {
  workflowId: string
  userId: string
  provider: string
  triggerType: string
  triggerData: any
  /** Optional metadata about the webhook event (subscriptionId, requestId, etc.) */
  metadata?: Record<string, any>
  /**
   * Unique key for deduplication. If not provided, one is derived from triggerData.
   * Same dedupeKey + workflowId within the TTL window = skipped execution.
   */
  dedupeKey?: string
  /** Set to true to skip dedup check (e.g. for test mode) */
  skipDedup?: boolean
}

export interface WebhookExecutionResult {
  success: boolean
  sessionId?: string
  error?: string
  /** True if this event was a duplicate and was skipped */
  duplicate?: boolean
}

// ─── In-Memory Dedup Cache ──────────────────────────────────────────────────
// Fast, zero-latency dedup for the common case of rapid retries.
// TTL ensures memory doesn't grow unbounded.

const DEDUP_TTL_MS = 5 * 60 * 1000 // 5 minutes
const DEDUP_MAX_ENTRIES = 10_000

const dedupCache = new Map<string, number>() // key → timestamp

function buildDedupeKey(params: WebhookExecutionParams): string | null {
  if (params.dedupeKey) return `${params.workflowId}:${params.dedupeKey}`

  // Try to extract a unique event ID from trigger data
  const data = params.triggerData
  const eventId =
    data?.id ||
    data?.messageId ||
    data?.message?.id ||
    data?.orderId ||
    data?.objectId ||
    data?.eventId ||
    data?.action?.id ||
    data?.client_msg_id ||
    params.metadata?.requestId ||
    params.metadata?.eventId

  if (!eventId) return null

  return `${params.workflowId}:${params.provider}:${eventId}`
}

function isDuplicate(key: string): boolean {
  const cachedAt = dedupCache.get(key)
  if (!cachedAt) return false

  if (Date.now() - cachedAt > DEDUP_TTL_MS) {
    dedupCache.delete(key)
    return false
  }

  return true
}

function markProcessed(key: string): void {
  dedupCache.set(key, Date.now())

  // Evict oldest entries if cache grows too large
  if (dedupCache.size > DEDUP_MAX_ENTRIES) {
    const now = Date.now()
    for (const [k, ts] of dedupCache) {
      if (now - ts > DEDUP_TTL_MS) {
        dedupCache.delete(k)
      }
    }
    // If still too large after TTL cleanup, drop oldest entries
    if (dedupCache.size > DEDUP_MAX_ENTRIES) {
      const entries = Array.from(dedupCache.entries())
      entries.sort((a, b) => a[1] - b[1])
      const toRemove = entries.slice(0, entries.length - DEDUP_MAX_ENTRIES)
      for (const [k] of toRemove) {
        dedupCache.delete(k)
      }
    }
  }
}

/** Exposed for testing only */
export function _clearDedupCache(): void {
  dedupCache.clear()
}

/** Exposed for testing only */
export function _getDedupCacheSize(): number {
  return dedupCache.size
}

// ─── Main Execution Function ────────────────────────────────────────────────

/**
 * Execute a workflow triggered by a webhook event.
 *
 * This is the unified execution path — all webhook routes should call this
 * instead of WorkflowExecutionService, HTTP calls, or queue inserts.
 *
 * Built-in deduplication prevents duplicate workflow runs when providers
 * retry webhook deliveries.
 */
export async function executeWebhookWorkflow(
  params: WebhookExecutionParams
): Promise<WebhookExecutionResult> {
  const { workflowId, userId, provider, triggerType, triggerData, metadata } = params

  // ── Dedup Check ──
  if (!params.skipDedup) {
    const dedupeKey = buildDedupeKey(params)
    if (dedupeKey) {
      if (isDuplicate(dedupeKey)) {
        logger.info(`[Webhook Execute] Duplicate event skipped`, {
          provider,
          triggerType,
          workflowId,
          dedupeKey,
        })
        return { success: true, duplicate: true }
      }
      // Mark as processed BEFORE execution so concurrent retries are caught
      markProcessed(dedupeKey)
    }
  }

  // ── Execute Workflow ──
  try {
    const executionEngine = new AdvancedExecutionEngine()

    const executionSession = await executionEngine.createExecutionSession(
      workflowId,
      userId,
      'webhook',
      {
        webhookEvent: {
          provider,
          triggerType,
          metadata: metadata || {},
        },
        inputData: triggerData,
        triggerData,
        timestamp: new Date(),
      }
    )

    await executionEngine.executeWorkflowAdvanced(
      executionSession.id,
      triggerData,
      {
        enableParallel: true,
        maxConcurrency: 5,
      }
    )

    logger.info(`[Webhook Execute] Workflow ${workflowId} executed successfully`, {
      provider,
      triggerType,
      sessionId: executionSession.id,
    })

    return {
      success: true,
      sessionId: executionSession.id,
    }
  } catch (error: any) {
    logger.error(`[Webhook Execute] Failed to execute workflow ${workflowId}:`, {
      provider,
      triggerType,
      error: error.message,
    })

    return {
      success: false,
      error: error.message,
    }
  }
}
