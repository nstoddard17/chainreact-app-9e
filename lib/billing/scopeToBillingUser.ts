import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type { BillingScope } from './types'

/**
 * Maps a canonical billing scope to the user_profiles row for the current
 * billing backend. This exists because subscriptions currently live on
 * user_profiles, not on scopes directly.
 *
 * DELETE THIS when scope-native subscriptions exist (Phase 6).
 *
 * No fallback. If lookup fails, throws — it indicates data integrity failure.
 */
export async function scopeToBillingUser(scope: BillingScope): Promise<string> {
  const { scopeType, scopeId } = scope

  if (scopeType === 'user') {
    logger.debug('[scopeToBillingUser] User scope — direct mapping', { scopeId })
    return scopeId
  }

  const supabase = createAdminClient()

  if (scopeType === 'team') {
    const { data: ownerMember, error } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', scopeId)
      .eq('role', 'owner')
      .limit(1)
      .single()

    if (error || !ownerMember) {
      logger.error('[scopeToBillingUser] Team owner lookup failed — data integrity error', {
        teamId: scopeId,
        error: error?.message,
      })
      throw new Error(`Billing integrity failure: team ${scopeId} has no owner member`)
    }

    logger.debug('[scopeToBillingUser] Team scope resolved', {
      teamId: scopeId,
      billingUserId: ownerMember.user_id,
    })
    return ownerMember.user_id
  }

  if (scopeType === 'organization') {
    const { data: org, error } = await supabase
      .from('organizations')
      .select('owner_id')
      .eq('id', scopeId)
      .single()

    if (error || !org || !org.owner_id) {
      logger.error('[scopeToBillingUser] Organization owner lookup failed — data integrity error', {
        orgId: scopeId,
        error: error?.message,
      })
      throw new Error(`Billing integrity failure: organization ${scopeId} has no owner`)
    }

    logger.debug('[scopeToBillingUser] Organization scope resolved', {
      orgId: scopeId,
      billingUserId: org.owner_id,
    })
    return org.owner_id
  }

  throw new Error(`Unknown billing scope type: ${scopeType}`)
}
