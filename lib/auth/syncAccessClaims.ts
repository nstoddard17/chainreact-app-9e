/**
 * Syncs access-relevant profile fields into Supabase `raw_app_meta_data`.
 *
 * The middleware reads these JWT claims instead of querying the DB on every
 * request. Every code path that changes `plan`, `admin_capabilities`, or
 * `username` on `user_profiles` MUST call this function so the JWT stays in sync.
 *
 * The DB trigger `sync_access_claims` handles direct SQL updates (Stripe
 * webhooks, admin console). This function handles application-layer updates.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import type { AdminCapabilities } from '@/lib/types/admin'

interface ClaimFields {
  plan?: string | null
  admin_capabilities?: AdminCapabilities | null
  username?: string | null
}

export async function syncAccessClaims(
  adminClient: SupabaseClient,
  userId: string,
  fields: ClaimFields,
) {
  try {
    const capabilities = fields.admin_capabilities || {}

    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      app_metadata: {
        plan: fields.plan || 'free',
        admin_capabilities: capabilities,
        has_username: !!(fields.username && fields.username.trim() !== ''),
      },
    })

    if (error) {
      logger.error('[syncAccessClaims] Failed to update app_metadata', {
        userId,
        error: error.message,
      })
      throw error
    }

    logger.info('[syncAccessClaims] Claims synced', {
      userId,
      plan: fields.plan || 'free',
      admin_capabilities: capabilities,
      has_username: !!(fields.username && fields.username.trim() !== ''),
    })
  } catch (err) {
    // Non-fatal — the DB trigger is the backup, and JWT refreshes naturally
    logger.error('[syncAccessClaims] Error (non-fatal)', err)
  }
}
