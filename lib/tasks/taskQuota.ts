import { logger } from '@/lib/utils/logger'

export interface TaskQuotaResult {
  allowed: boolean
  limit: number
  used: number
  remaining: number
  required: number
  scope: 'team' | 'profile'
  entityId: string
}

interface TaskQuotaParams {
  supabase: any
  userId: string
  teamId?: string | null
  required: number
}

/**
 * Fetch and reserve tasks for a workflow run.
 * Returns the quota state after reservation (or the current state if blocked).
 */
export async function ensureTaskQuota(params: TaskQuotaParams): Promise<TaskQuotaResult> {
  const { supabase, userId, teamId, required } = params
  const scope = teamId ? 'team' : 'profile'
  const entityId = teamId || userId
  const table = teamId ? 'teams' : 'profiles'

  logger.debug('[TaskQuota] Checking quota', { scope, entityId, required })

  // Fetch current quota
  const { data: quota, error: fetchError } = await supabase
    .from(table)
    .select('tasks_limit, tasks_used')
    .eq('id', entityId)
    .single()

  if (fetchError) {
    logger.error('[TaskQuota] Failed to fetch quota', { scope, entityId, error: fetchError })
    throw new Error('Failed to check task balance')
  }

  // Default to sane baselines if columns are missing
  const limitRaw = quota?.tasks_limit
  const usedRaw = quota?.tasks_used
  const limit = typeof limitRaw === 'number' && limitRaw >= 0 ? limitRaw : 100
  const used = typeof usedRaw === 'number' && usedRaw >= 0 ? usedRaw : 0

  // No unlimited plans: negative or zero limits effectively block
  const remaining = Math.max(0, limit - used)
  const allowed = remaining >= required && limit > 0

  const result: TaskQuotaResult = {
    allowed,
    limit,
    used,
    remaining,
    required,
    scope,
    entityId,
  }

  if (!allowed) {
    logger.warn('[TaskQuota] Insufficient balance', {
      scope,
      entityId,
      limit,
      used,
      required,
      remaining,
    })
    return result
  }

  // Reserve tasks
  const newUsed = used + required
  const { data: updated, error: updateError } = await supabase
    .from(table)
    .update({
      tasks_used: newUsed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entityId)
    .select('tasks_limit, tasks_used')
    .single()

  if (updateError) {
    logger.error('[TaskQuota] Failed to reserve tasks', { scope, entityId, error: updateError })
    throw new Error('Failed to reserve tasks for workflow run')
  }

  const updatedLimit = typeof updated?.tasks_limit === 'number' && updated.tasks_limit >= 0 ? updated.tasks_limit : limit
  const updatedUsed = typeof updated?.tasks_used === 'number' && updated.tasks_used >= 0 ? updated.tasks_used : newUsed
  const updatedRemaining = Math.max(0, updatedLimit - updatedUsed)

  logger.debug('[TaskQuota] Tasks reserved', {
    scope,
    entityId,
    required,
    used: updatedUsed,
    limit: updatedLimit,
    remaining: updatedRemaining,
  })

  return {
    allowed: true,
    limit: updatedLimit,
    used: updatedUsed,
    remaining: updatedRemaining,
    required,
    scope,
    entityId,
  }
}
