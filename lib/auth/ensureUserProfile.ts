/**
 * Single idempotent path for creating or updating user profiles.
 *
 * Every server-side code path that needs a user_profiles row should call
 * `ensureUserProfile()` instead of issuing its own INSERT/UPSERT.
 * This eliminates race conditions and guarantees consistent default fields.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { buildDefaultProfileFields } from '@/lib/utils/profile-defaults'
import { syncAccessClaims } from '@/lib/auth/syncAccessClaims'
import { logger } from '@/lib/utils/logger'

// Fields returned by ensureUserProfile (matches the profile API select)
const PROFILE_SELECT =
  'id, email, full_name, first_name, last_name, role, plan, admin_capabilities, provider, avatar_url, company, job_title, secondary_email, phone_number, tasks_used, tasks_limit, billing_period_start, created_at, updated_at'

/** Partial input callers can use to override derived/default values. */
export interface ProfileOverrides {
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  provider?: string | null
  role?: string | null
  avatar_url?: string | null
  company?: string | null
  job_title?: string | null
  secondary_email?: string | null
  phone_number?: string | null
}

// ---------------------------------------------------------------------------
// Shared derivation helpers (consolidated from 3+ duplicated implementations)
// ---------------------------------------------------------------------------

export function deriveProvider(
  appMetadata: Record<string, any> | undefined,
  identities?: Array<{ provider: string }>,
): string {
  if (appMetadata?.provider) return appMetadata.provider
  if (appMetadata?.providers?.[0]) return appMetadata.providers[0]
  if (identities?.[0]?.provider) return identities[0].provider
  return 'email'
}

export function deriveRoleFromMetadata(
  userMetadata: Record<string, any> | undefined,
): string {
  const metadata = userMetadata || {}
  const explicitRole =
    metadata.role || metadata.account_role || metadata.membership_role
  if (explicitRole && typeof explicitRole === 'string') return explicitRole
  if (metadata.is_beta_tester === true || metadata.beta_tester === true)
    return 'beta-pro'
  return 'free'
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Ensures a `user_profiles` row exists for the given user.
 *
 * - If a row already exists it is returned as-is (no overwrite).
 * - If no row exists, one is created with billing defaults + derived fields
 *   + caller-supplied overrides.
 * - If two concurrent calls race to INSERT, the loser catches the unique
 *   constraint violation and falls back to a SELECT.
 *
 * @param adminClient  A Supabase client with service-role privileges.
 * @param userId       The auth.users UUID.
 * @param overrides    Optional fields the caller wants to explicitly set.
 *                     `undefined` values are ignored; `null` is written.
 * @param options.applyOverridesToExisting  If true and a row already exists,
 *        UPDATE the row with the non-undefined overrides. Used by flows that
 *        need to mutate existing profiles (e.g. beta conversion).
 */
export async function ensureUserProfile(
  adminClient: SupabaseClient,
  userId: string,
  overrides?: ProfileOverrides,
  options?: { applyOverridesToExisting?: boolean },
) {
  // 1. Check for existing row
  const { data: existing, error: selectError } = await adminClient
    .from('user_profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle()

  if (existing) {
    // Apply overrides to existing row if caller requests it
    if (options?.applyOverridesToExisting && overrides) {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() }
      for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined) {
          updates[key] = value
        }
      }

      const { data: updated, error: updateError } = await adminClient
        .from('user_profiles')
        .update(updates)
        .eq('id', userId)
        .select(PROFILE_SELECT)
        .single()

      if (updated) {
        // Sync claims if entitlement fields were changed
        if ('plan' in updates || 'admin_capabilities' in updates) {
          await syncAccessClaims(adminClient, userId, {
            plan: updated.plan,
            admin_capabilities: updated.admin_capabilities,
          })
        }
        return { profile: updated, created: false }
      }
      if (updateError) {
        logger.error('[ensureUserProfile] Failed to update existing profile', updateError)
        throw updateError
      }
    }

    return { profile: existing, created: false }
  }

  if (selectError && selectError.code !== 'PGRST116') {
    logger.error('[ensureUserProfile] Unexpected select error', selectError)
    throw selectError
  }

  // 2. Row doesn't exist — fetch auth metadata to derive fields
  const { data: authData, error: authError } =
    await adminClient.auth.admin.getUserById(userId)

  if (authError || !authData?.user) {
    logger.error('[ensureUserProfile] Failed to load auth user', authError)
    throw authError || new Error('Auth user not found')
  }

  const authUser = authData.user
  const metadata = authUser.user_metadata || {}
  const fullName = metadata.full_name || metadata.name || ''
  const firstName =
    metadata.first_name ||
    metadata.given_name ||
    (fullName ? fullName.split(' ')[0] : '')
  const lastName =
    metadata.last_name ||
    metadata.family_name ||
    (fullName ? fullName.split(' ').slice(1).join(' ') : '')

  const derivedProvider = deriveProvider(authUser.app_metadata, authUser.identities)
  const derivedRole = deriveRoleFromMetadata(metadata)

  const now = new Date().toISOString()
  const defaults = await buildDefaultProfileFields()

  // Build the full payload: defaults → derived → overrides (stripped of undefined)
  const derived: Record<string, any> = {
    id: userId,
    email: authUser.email,
    full_name: fullName || null,
    first_name: firstName || null,
    last_name: lastName || null,
    provider: derivedProvider,
    role: derivedRole,
    avatar_url: metadata.avatar_url || metadata.picture || null,
    company: metadata.company || null,
    job_title: metadata.job_title || null,
    secondary_email: metadata.secondary_email || null,
    phone_number: metadata.phone_number || null,
    created_at: now,
    updated_at: now,
    ...defaults,
  }

  // Apply caller overrides — only keys that are explicitly present (including null)
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) {
        derived[key] = value
      }
    }
  }

  // 3. INSERT
  const { data: created, error: insertError } = await adminClient
    .from('user_profiles')
    .insert(derived)
    .select(PROFILE_SELECT)
    .single()

  if (created) {
    // Sync JWT claims for the new profile
    await syncAccessClaims(adminClient, userId, {
      plan: created.plan,
      admin_capabilities: created.admin_capabilities,
    })
    return { profile: created, created: true }
  }

  // 4. Race-condition fallback: unique constraint violation → SELECT the winner's row
  if (
    insertError &&
    (insertError.code === '23505' || insertError.message?.includes('duplicate'))
  ) {
    logger.info('[ensureUserProfile] Race detected, fetching existing row')
    const { data: raced } = await adminClient
      .from('user_profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .single()

    if (raced) {
      return { profile: raced, created: false }
    }
  }

  // 5. Genuine failure
  logger.error('[ensureUserProfile] Insert failed', insertError)
  throw insertError || new Error('Failed to create user profile')
}
