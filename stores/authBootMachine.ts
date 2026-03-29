/**
 * Auth Boot State Machine
 *
 * Single deterministic pipeline: idle → rehydrating → authenticating → loading_profile → ready
 * One timeout (10s), one AbortController, bootId-guarded transitions.
 * Every failure path converges on 'ready' — the app always becomes usable.
 */

import { supabase } from '@/utils/supabaseClient'
import { logger } from '@/lib/utils/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BootPhase = 'idle' | 'rehydrating' | 'authenticating' | 'loading_profile' | 'ready'

export interface User {
  id: string
  email: string
  name?: string
  first_name?: string
  last_name?: string
  full_name?: string
  avatar?: string
}

export interface Profile {
  id: string
  full_name?: string
  first_name?: string
  last_name?: string
  avatar_url?: string
  company?: string
  job_title?: string
  username?: string
  secondary_email?: string
  phone_number?: string
  email?: string
  provider?: string
  role?: string
  admin?: boolean
  tasks_used?: number
  tasks_limit?: number
  billing_period_start?: string
  plan?: string
  created_at?: string
  updated_at?: string
  ai_agent_preference?: 'always_show' | 'always_skip' | 'ask_later'
  ai_agent_skip_count?: number
  ai_agent_preference_updated_at?: string
  default_workspace_type?: 'personal' | 'team' | 'organization' | null
  default_workspace_id?: string | null
  workflow_creation_mode?: 'default' | 'ask' | 'follow_switcher'
}

export interface BootSlice {
  phase: BootPhase
  bootId: number
  bootError: string | null
  lastBootCompletedAt: number
  user: User | null
  profile: Profile | null
  loading: boolean
  error: string | null
}

type SetState = (partial: Partial<BootSlice> | ((state: BootSlice) => Partial<BootSlice>)) => void
type GetState = () => BootSlice

const BOOT_TIMEOUT_MS = 10_000
const PROFILE_COLUMNS = 'id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, plan, admin, email, tasks_used, tasks_limit, billing_period_start, created_at, updated_at'

// ---------------------------------------------------------------------------
// Transition guard
// ---------------------------------------------------------------------------

function transition(
  set: SetState,
  get: GetState,
  toPhase: BootPhase,
  expectedBootId: number,
  updates?: Partial<BootSlice>
): boolean {
  const current = get()
  if (current.bootId !== expectedBootId) return false
  if (current.phase === 'ready' && toPhase !== 'idle') return false
  set({ phase: toPhase, ...updates })
  return true
}

// ---------------------------------------------------------------------------
// Profile helpers
// ---------------------------------------------------------------------------

export function mapProfileData(raw: any): Profile {
  return {
    id: raw.id,
    username: raw.username ?? undefined,
    full_name: raw.full_name ?? undefined,
    first_name: raw.first_name ?? undefined,
    last_name: raw.last_name ?? undefined,
    avatar_url: raw.avatar_url ?? undefined,
    company: raw.company ?? undefined,
    job_title: raw.job_title ?? undefined,
    role: raw.role ?? undefined,
    plan: raw.plan ?? undefined,
    admin: raw.admin ?? false,
    secondary_email: raw.secondary_email ?? undefined,
    phone_number: raw.phone_number ?? undefined,
    email: raw.email ?? undefined,
    provider: raw.provider ?? undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    tasks_used: raw.tasks_used ?? 0,
    tasks_limit: raw.tasks_limit ?? undefined,
    billing_period_start: raw.billing_period_start ?? undefined,
  }
}

function deriveRoleFromMetadata(userMetadata: any): string {
  const metadata = userMetadata || {}
  const explicitRole = metadata.role || metadata.account_role || metadata.membership_role
  if (explicitRole && typeof explicitRole === 'string') return explicitRole
  if (metadata.is_beta_tester === true || metadata.beta_tester === true) return 'beta-pro'
  return 'free'
}

async function fetchProfilePipeline(
  userId: string,
  supabaseUser: any,
  signal: AbortSignal
): Promise<{ user: User; profile: Profile | null }> {
  const userObj: User = {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name,
    avatar: supabaseUser.user_metadata?.avatar_url,
  }

  // Try 1: API endpoint
  try {
    const response = await fetch('/api/auth/profile', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal,
    })
    if (response.ok) {
      const payload = await response.json()
      if (payload?.profile) {
        const profile = mapProfileData(payload.profile)
        userObj.first_name = profile.first_name
        userObj.last_name = profile.last_name
        userObj.full_name = profile.full_name || userObj.name
        return { user: userObj, profile }
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err // re-throw abort
    logger.warn('[Boot] API profile fetch failed, trying direct query', { error: err?.message })
  }

  // Try 2: Direct Supabase query
  const { data, error } = await supabase
    .from('user_profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single()

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  if (data) {
    const profile = mapProfileData(data)
    userObj.first_name = profile.first_name
    userObj.last_name = profile.last_name
    userObj.full_name = profile.full_name || userObj.name
    return { user: userObj, profile }
  }

  // Try 3: Create new profile (error code PGRST116 = not found)
  if (error?.code === 'PGRST116' || !data) {
    const isGoogleUser =
      supabaseUser.app_metadata?.provider === 'google' ||
      supabaseUser.app_metadata?.providers?.includes('google') ||
      supabaseUser.identities?.some((id: any) => id.provider === 'google')

    let firstName = supabaseUser.user_metadata?.given_name || ''
    let lastName = supabaseUser.user_metadata?.family_name || ''
    const fullName = supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || ''

    if ((!firstName || !lastName) && fullName) {
      const parts = fullName.split(' ')
      firstName = firstName || parts[0] || ''
      lastName = lastName || parts.slice(1).join(' ') || ''
    }

    const derivedRole = deriveRoleFromMetadata(supabaseUser.user_metadata)

    const createResult = await supabase
      .from('user_profiles')
      .insert({
        id: userId,
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        avatar_url: supabaseUser.user_metadata?.avatar_url || supabaseUser.user_metadata?.picture,
        email: supabaseUser.email,
        provider: isGoogleUser ? 'google' : 'email',
        role: derivedRole,
        plan: 'free',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        username: isGoogleUser ? null : undefined,
      })
      .select(PROFILE_COLUMNS)
      .single()

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    if (createResult.data) {
      const profile = mapProfileData(createResult.data)
      userObj.first_name = profile.first_name
      userObj.last_name = profile.last_name
      userObj.full_name = profile.full_name || userObj.name
      return { user: userObj, profile }
    }

    // Creation failed — in-memory fallback
    logger.warn('[Boot] Profile creation failed, using fallback', { error: createResult.error })
    const detectedProvider =
      supabaseUser.app_metadata?.provider ||
      supabaseUser.app_metadata?.providers?.[0] ||
      (isGoogleUser ? 'google' : 'email')

    const fallbackProfile: Profile = {
      id: userId,
      full_name: fullName || supabaseUser.email?.split('@')[0] || 'User',
      first_name: firstName,
      last_name: lastName,
      avatar_url: supabaseUser.user_metadata?.avatar_url,
      email: supabaseUser.email ?? undefined,
      provider: detectedProvider,
      role: derivedRole,
      username: isGoogleUser ? undefined : supabaseUser.email?.split('@')[0] || 'user',
    }
    userObj.first_name = firstName
    userObj.last_name = lastName
    userObj.full_name = fullName || userObj.name
    return { user: userObj, profile: fallbackProfile }
  }

  return { user: userObj, profile: null }
}

// ---------------------------------------------------------------------------
// Boot pipeline
// ---------------------------------------------------------------------------

export async function boot(set: SetState, get: GetState): Promise<void> {
  const currentPhase = get().phase
  const currentBootId = get().bootId

  // Idempotency: don't start a new boot if one is already running
  if (currentPhase !== 'idle' && currentPhase !== 'ready') {
    logger.debug('[Boot] Already booting, skipping', { phase: currentPhase })
    return
  }

  const id = currentBootId + 1
  set({ bootId: id, phase: 'rehydrating', bootError: null, loading: true, error: null })

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
    const state = get()
    if (state.bootId === id && state.phase !== 'ready') {
      logger.warn('[Boot] Timeout reached, forcing ready with partial data', { phase: state.phase })
      set({
        phase: 'ready',
        loading: false,
        bootError: 'Boot timeout — partial data may be available',
        lastBootCompletedAt: Date.now(),
      })
    }
  }, BOOT_TIMEOUT_MS)

  try {
    // Phase: authenticating
    if (!transition(set, get, 'authenticating', id)) return

    // Handle magic link hash fragments
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      if (hash && hash.includes('access_token')) {
        const urlParams = new URLSearchParams(hash.substring(1))
        const accessToken = urlParams.get('access_token')
        const refreshToken = urlParams.get('refresh_token')

        if (accessToken && refreshToken) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (!sessionError && data.session) {
            window.location.hash = ''
            window.location.href = '/workflows'
            clearTimeout(timer)
            return
          }
        }
      }
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (get().bootId !== id) return // stale

    if (sessionError) {
      logger.warn('[Boot] Session error, treating as unauthenticated', { error: sessionError.message })
    }

    if (!session?.user) {
      transition(set, get, 'ready', id, {
        user: null,
        profile: null,
        loading: false,
        lastBootCompletedAt: Date.now(),
      })

      // Clear integration store when no user
      setTimeout(async () => {
        try {
          const { useIntegrationStore } = await import('./integrationStore')
          const integrationStore = useIntegrationStore.getState()
          integrationStore.setCurrentUserId(null)
          integrationStore.clearAllData()
        } catch { /* ignore */ }
      }, 50)
      return
    }

    // Phase: loading_profile
    if (!transition(set, get, 'loading_profile', id)) return

    const { user, profile } = await fetchProfilePipeline(
      session.user.id,
      session.user,
      controller.signal
    )

    if (get().bootId !== id) return // stale

    // Check for stale profile overwrite
    const existingProfile = get().profile
    const existingUpdatedAt = existingProfile?.updated_at ? Date.parse(existingProfile.updated_at) : NaN
    const fetchedUpdatedAt = profile?.updated_at ? Date.parse(profile.updated_at) : NaN
    const keepExisting =
      existingProfile &&
      !Number.isNaN(existingUpdatedAt) &&
      !Number.isNaN(fetchedUpdatedAt) &&
      existingUpdatedAt > fetchedUpdatedAt

    transition(set, get, 'ready', id, {
      user,
      profile: keepExisting ? existingProfile : profile,
      loading: false,
      lastBootCompletedAt: Date.now(),
    })

    // Post-boot side effects
    if (profile) {
      // Check username and redirect if needed
      setTimeout(() => {
        if (profile.provider === 'google' && (!profile.username || profile.username.trim() === '')) {
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/auth/setup-username')) {
            window.location.href = '/auth/setup-username'
          }
        }
      }, 100)

      // Update integration store
      setTimeout(async () => {
        try {
          const { useIntegrationStore } = await import('./integrationStore')
          useIntegrationStore.getState().setCurrentUserId(session.user.id)
        } catch { /* ignore */ }
      }, 50)

      // Background integration preload
      setTimeout(async () => {
        try {
          const { useIntegrationStore } = await import('./integrationStore')
          const store = useIntegrationStore.getState()
          if (!store.preloadStarted && !store.globalPreloadingData) {
            await store.fetchIntegrations(false)
          }
        } catch { /* ignore */ }
      }, 3000)
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // Timeout already handled above
      return
    }
    logger.error('[Boot] Unhandled error', { error: err?.message })
    if (get().bootId === id) {
      set({
        phase: 'ready',
        user: get().user, // keep whatever we have
        loading: false,
        error: err?.message || 'Boot error',
        bootError: err?.message || 'Boot error',
        lastBootCompletedAt: Date.now(),
      })
    }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const BOOT_INITIAL_STATE: BootSlice = {
  phase: 'idle',
  bootId: 0,
  bootError: null,
  lastBootCompletedAt: 0,
  user: null,
  profile: null,
  loading: false,
  error: null,
}
