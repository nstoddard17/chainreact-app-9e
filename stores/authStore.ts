"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { supabase } from "@/utils/supabaseClient"
import { getCrossTabSync } from "@/lib/utils/cross-tab-sync"
import { logger } from '@/lib/utils/logger'
import {
  boot as bootPipeline,
  mapProfileData as bootMapProfile,
  BOOT_INITIAL_STATE,
  type BootPhase,
  type BootSlice,
  type User,
  type Profile,
} from './authBootMachine'

// Re-export types so consumers don't need to import from two places
export type { BootPhase, User, Profile }

interface AuthState extends BootSlice {
  boot: () => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  updateDefaultWorkspace: (workspaceType: 'personal' | 'team' | 'organization' | null, workspaceId?: string | null) => Promise<void>
  clearDefaultWorkspace: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, metadata?: Record<string, any>) => Promise<void>
  signInWithGoogle: () => Promise<void>
  getCurrentUserId: () => string | null
  checkUsernameAndRedirect: () => void
  refreshSession: () => Promise<boolean>
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...BOOT_INITIAL_STATE,

      boot: async () => {
        await bootPipeline(
          set as any,
          get as any
        )
      },

      signOut: async () => {
        try {
          logger.debug("Starting sign out process...")

          // Reset to idle and clear data
          set({
            phase: 'idle' as BootPhase,
            user: null,
            profile: null,
            loading: false,
            error: null,
            bootError: null,
          })

          // Clear localStorage immediately
          if (typeof window !== 'undefined') {
            localStorage.removeItem('chainreact-auth')
            localStorage.removeItem('pendingSignup')

            const keys = Object.keys(localStorage)
            keys.forEach(key => {
              if (key.startsWith('sb-') || key.includes('supabase')) {
                localStorage.removeItem(key)
              }
            })
          }

          // Clear all stores
          try {
            const { useIntegrationStore } = await import("./integrationStore")
            const integrationStore = useIntegrationStore.getState()
            integrationStore.setCurrentUserId(null)
            integrationStore.clearAllData()

            try {
              const { useWorkflowStore } = await import("./workflowStore")
              const workflowStore = useWorkflowStore.getState()
              if (workflowStore.clearAllData) workflowStore.clearAllData()
            } catch { /* ignore */ }

            try {
              const { useAnalyticsStore } = await import("./analyticsStore")
              const analyticsStore = useAnalyticsStore.getState()
              if (analyticsStore.clearAllData) analyticsStore.clearAllData()
            } catch { /* ignore */ }

            try {
              const { useAdminStore } = await import("./adminStore")
              const adminStore = useAdminStore.getState()
              if (adminStore.clearAllData) adminStore.clearAllData()
            } catch { /* ignore */ }

            try {
              const { useBillingStore } = await import("./billingStore")
              const billingStore = useBillingStore.getState()
              if (billingStore.clearAllData) billingStore.clearAllData()
            } catch { /* ignore */ }
          } catch (error) {
            logger.error("Error clearing stores:", error)
          }

          // Broadcast and dispatch events
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('user-signout'))
            const sync = getCrossTabSync()
            sync.broadcast('auth-logout', {})
          }

          // Sign out from Supabase in background
          supabase.auth.signOut().catch((error) => {
            logger.error("Supabase sign out error:", error)
          })

        } catch (error: any) {
          logger.error("Sign out error:", error)
          set({
            phase: 'idle' as BootPhase,
            user: null,
            profile: null,
            loading: false,
            error: null,
          })
          if (typeof window !== 'undefined') {
            localStorage.removeItem('chainreact-auth')
            localStorage.removeItem('pendingSignup')
            const keys = Object.keys(localStorage)
            keys.forEach(key => {
              if (key.startsWith('sb-') || key.includes('supabase')) {
                localStorage.removeItem(key)
              }
            })
          }
        }
      },

      updateProfile: async (updates: Partial<Profile>) => {
        try {
          const { user } = get()
          if (!user) throw new Error("No user logged in")

          const updatedAt = new Date().toISOString()

          const { error: profileError } = await supabase
            .from('user_profiles')
            .upsert({
              id: user.id,
              full_name: updates.full_name,
              first_name: updates.first_name,
              last_name: updates.last_name,
              username: updates.username,
              email: updates.email || user.email,
              company: updates.company,
              job_title: updates.job_title,
              secondary_email: updates.secondary_email,
              phone_number: updates.phone_number,
              provider: updates.provider,
              avatar_url: updates.avatar_url,
              updated_at: updatedAt,
            }, { onConflict: 'id' })

          if (profileError) throw profileError

          const { error: authError } = await supabase.auth.updateUser({
            data: {
              full_name: updates.full_name,
              avatar_url: updates.avatar_url,
            },
          })

          if (authError) throw authError

          const { profile } = get()
          const updatedUser = {
            ...user,
            name: updates.full_name ?? user.name,
            first_name: updates.first_name ?? user.first_name,
            last_name: updates.last_name ?? user.last_name,
            full_name: updates.full_name ?? user.full_name,
            avatar: updates.avatar_url ?? user.avatar,
          }

          const updatedProfile = {
            ...(profile || {}),
            ...updates,
            id: user.id,
            updated_at: updatedAt,
          } as Profile

          set({ user: updatedUser, profile: updatedProfile })

          if (typeof window !== 'undefined') {
            const sync = getCrossTabSync()
            sync.broadcast('auth-update', { profile: updatedProfile })
          }
        } catch (error: any) {
          logger.error("Profile update error:", error)
          set({ error: error.message })
          throw error
        }
      },

      updateDefaultWorkspace: async (workspaceType, workspaceId) => {
        try {
          const { user, profile } = get()
          if (!user) throw new Error("No user logged in")

          const response = await fetch('/api/user/default-workspace', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_type: workspaceType,
              workspace_id: workspaceId
            })
          })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to update default workspace')
          }

          set({
            profile: {
              ...profile,
              default_workspace_type: workspaceType,
              default_workspace_id: workspaceId || null
            } as Profile
          })
        } catch (error: any) {
          logger.error('[AuthStore] Error updating default workspace:', error)
          throw error
        }
      },

      clearDefaultWorkspace: async () => {
        try {
          const { user, profile } = get()
          if (!user) throw new Error("No user logged in")

          const response = await fetch('/api/user/default-workspace', { method: 'DELETE' })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to clear default workspace')
          }

          set({
            profile: {
              ...profile,
              default_workspace_type: null,
              default_workspace_id: null
            } as Profile
          })
        } catch (error: any) {
          logger.error('[AuthStore] Error clearing default workspace:', error)
          throw error
        }
      },

      signIn: async (email: string, password: string) => {
        const signInTimeout = setTimeout(() => {
          set({ error: 'Sign-in timed out. Please try again.', loading: false })
        }, 10000)

        try {
          set({ loading: true, error: null })

          const signInPromise = supabase.auth.signInWithPassword({ email, password })
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Sign-in timeout')), 8000)
          )

          let result
          try {
            result = await Promise.race([signInPromise, timeoutPromise])
          } catch (timeoutError) {
            clearTimeout(signInTimeout)
            set({ error: 'Sign-in timed out. Please try again.', loading: false })
            throw new Error('Sign-in timed out. Please try again.')
          }

          const { data, error } = result

          if (error) {
            clearTimeout(signInTimeout)
            set({ error: error.message, loading: false })
            throw error
          }

          if (data.user) {
            const user: User = {
              id: data.user.id,
              email: data.user.email || "",
              name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
              avatar: data.user.user_metadata?.avatar_url,
            }

            clearTimeout(signInTimeout)
            set({ user, profile: null, loading: false, phase: 'ready' as BootPhase })

            // Fetch profile in background
            const fetchProfileAsync = async () => {
              try {
                const store = useAuthStore.getState()
                if (store.lastProfileFetch) {
                  (store as any).lastProfileFetch = 0
                }
                if ((store as any).fetchProfile) {
                  await (store as any).fetchProfile(data.user.id)
                }
              } catch (profileError) {
                logger.warn('Profile fetch failed in background:', profileError)
              }
            }
            fetchProfileAsync()

            // Update integration store
            setTimeout(async () => {
              try {
                const { useIntegrationStore } = await import("./integrationStore")
                useIntegrationStore.getState().setCurrentUserId(data.user.id)
              } catch { /* ignore */ }
            }, 100)

            return { user, profile: null } as any
          }

          set({ loading: false })
          throw new Error("Login failed - no user data returned")
        } catch (error: any) {
          clearTimeout(signInTimeout)
          set({ error: error.message, loading: false })
          throw error
        } finally {
          clearTimeout(signInTimeout)
        }
      },

      signUp: async (email: string, password: string, metadata?: Record<string, any>) => {
        try {
          set({ loading: true, error: null })

          const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, metadata })
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || 'Failed to create account')
          }

          const result = await response.json()

          if (result.userId) {
            localStorage.setItem('pendingSignup', JSON.stringify({
              userId: result.userId,
              email,
              metadata,
              timestamp: Date.now()
            }))
          }

          set({ loading: false })
        } catch (error: any) {
          logger.error("Sign up error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      signInWithGoogle: async () => {
        try {
          set({ loading: true, error: null })

          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/api/auth/callback`,
            },
          })

          if (error) throw error
        } catch (error: any) {
          logger.error("Google sign in error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      getCurrentUserId: () => {
        return get().user?.id ?? null
      },

      checkUsernameAndRedirect: () => {
        const state = get()
        if (state.profile &&
            state.profile.provider === 'google' &&
            (!state.profile.username || state.profile.username.trim() === '')) {
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/auth/setup-username')) {
            window.location.href = '/auth/setup-username'
          }
        }
      },

      refreshSession: async () => {
        try {
          const { data: { session }, error } = await supabase.auth.refreshSession()

          if (error) {
            logger.error("Session refresh error:", error)
            return false
          }

          if (session?.user) {
            const user = session.user
            set({
              user: {
                id: user.id,
                email: user.email || '',
                name: user.user_metadata?.name,
                first_name: user.user_metadata?.first_name,
                last_name: user.user_metadata?.last_name,
                full_name: user.user_metadata?.full_name,
                avatar: user.user_metadata?.avatar_url,
              }
            })
            return true
          }
          return false
        } catch (error) {
          logger.error("Session refresh failed:", error)
          return false
        }
      },

      isAuthenticated: () => {
        const state = get()
        return !!(state.user && state.user.id)
      },
    }),
    {
      name: "chainreact-auth",
      version: 3, // Bumped for phase-based boot model
      migrate: (persistedState: any, version: number) => {
        if (version !== 3) {
          logger.warn('[AUTH] Persisted state version mismatch, clearing stale data', {
            persistedVersion: version,
            currentVersion: 3,
          })
          return {
            ...BOOT_INITIAL_STATE,
          }
        }
        return persistedState
      },
      storage: {
        getItem: (name) => {
          try {
            if (typeof window === 'undefined') return null

            const str = localStorage.getItem(name)
            if (!str) return null

            if (str.startsWith('base64-') || str.includes('eyJ')) {
              logger.warn('Detected corrupted auth data, clearing...')
              localStorage.removeItem(name)
              return null
            }

            const data = JSON.parse(str)

            if (data && typeof data === 'object' && data.state) {
              return str
            }

            logger.warn('Invalid auth data structure, clearing...')
            localStorage.removeItem(name)
            return null
          } catch (error) {
            logger.error('Error reading auth storage:', error)
            if (typeof window !== 'undefined') {
              localStorage.removeItem(name)
            }
            return null
          }
        },
        setItem: (name, value) => {
          try {
            if (typeof window === 'undefined') return

            let stringValue = value
            if (typeof value !== 'string') {
              stringValue = JSON.stringify(value)
            }

            JSON.parse(stringValue)
            localStorage.setItem(name, stringValue)
          } catch (error: any) {
            if (error?.name === 'QuotaExceededError') {
              console.warn('LocalStorage quota exceeded - auth state may not persist')
            }
          }
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return
          localStorage.removeItem(name)
        },
      },
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          logger.error('[AUTH] Error during rehydration:', error)
          if (typeof window !== 'undefined') {
            try { localStorage.removeItem('chainreact-auth') } catch { /* ignore */ }
          }
        }

        // Boot is the single entry point — called once after rehydration
        if (state && typeof window !== 'undefined') {
          state.boot()
        }
      },
    },
  ),
)

// ---------------------------------------------------------------------------
// One-time listener setup (module scope — registered once, not per boot)
// ---------------------------------------------------------------------------

let listenersRegistered = false

function registerListeners() {
  if (listenersRegistered || typeof window === 'undefined') return
  listenersRegistered = true

  // Auth state change listener
  supabase.auth.onAuthStateChange(async (event, session) => {
    logger.debug('[AUTH] Auth state changed', { event, hasSession: !!session })

    if (event === 'SIGNED_IN' && session?.user) {
      const state = useAuthStore.getState()
      // If we're already ready with this user, just update profile
      if (state.phase === 'ready' && state.user?.id === session.user.id) {
        // Refresh profile data
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, plan, admin, email, tasks_used, tasks_limit, billing_period_start, created_at, updated_at')
          .eq('id', session.user.id)
          .single()

        if (profileData) {
          const profile = bootMapProfile(profileData)
          const existing = state.profile
          const existingTs = existing?.updated_at ? Date.parse(existing.updated_at) : NaN
          const incomingTs = profile.updated_at ? Date.parse(profile.updated_at) : NaN
          const keepExisting = existing && !Number.isNaN(existingTs) && !Number.isNaN(incomingTs) && existingTs > incomingTs

          if (!keepExisting) {
            useAuthStore.setState({ profile })
          }
        }

        // Broadcast to other tabs
        const sync = getCrossTabSync()
        sync.broadcast('auth-login', { userId: session.user.id, profile: state.profile })
        return
      }

      // New user or not ready — reboot
      if (!state.user || state.user.id !== session.user.id) {
        const user: User = {
          id: session.user.id,
          email: session.user.email || "",
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
          avatar: session.user.user_metadata?.avatar_url,
        }
        useAuthStore.setState({ user })
        state.boot()
      }
    } else if (event === 'SIGNED_OUT') {
      const state = useAuthStore.getState()
      if (state.user) {
        useAuthStore.setState({
          user: null,
          profile: null,
          loading: false,
          error: null,
          phase: 'ready' as BootPhase,
        })

        setTimeout(async () => {
          try {
            const { useIntegrationStore } = await import('./integrationStore')
            const integrationStore = useIntegrationStore.getState()
            integrationStore.setCurrentUserId(null)
            integrationStore.clearAllData()
          } catch { /* ignore */ }
        }, 100)
      }
    }
  })

  // Visibility change listener — throttled by lastBootCompletedAt
  let lastHiddenAt = Date.now()
  const STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastHiddenAt = Date.now()
    } else if (document.visibilityState === 'visible') {
      const state = useAuthStore.getState()
      const timeSinceHidden = Date.now() - lastHiddenAt
      const timeSinceBoot = Date.now() - state.lastBootCompletedAt

      // Only reboot if tab was hidden 5+ min AND boot data is stale
      if (timeSinceHidden >= STALE_THRESHOLD && timeSinceBoot >= STALE_THRESHOLD) {
        if (state.phase === 'ready') {
          logger.debug('[AUTH] Tab visible after extended absence, re-verifying session')
          // Reset to idle so boot() can run
          useAuthStore.setState({ phase: 'idle' as BootPhase })
          state.boot()
        }
      }
    }
  })

  // Cross-tab storage event listener
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== 'chainreact-auth') return

    try {
      if (event.newValue) {
        const newData = JSON.parse(event.newValue)
        const newState = newData?.state

        if (newState?.user && newState?.profile) {
          const current = useAuthStore.getState()
          if (!current.user || current.user.id !== newState.user.id) {
            useAuthStore.setState({
              user: newState.user,
              profile: newState.profile,
              phase: 'ready' as BootPhase,
              loading: false,
              error: null,
            })
          }
        }
      }
    } catch { /* ignore parse errors */ }
  })

  // Cross-tab sync via BroadcastChannel
  const sync = getCrossTabSync()

  sync.subscribe('auth-login', (data) => {
    const state = useAuthStore.getState()
    if (!state.user || state.user.id !== data.userId) {
      // Reset and reboot to pick up new session
      useAuthStore.setState({ phase: 'idle' as BootPhase })
      state.boot()
    }
  })

  sync.subscribe('auth-logout', () => {
    const state = useAuthStore.getState()
    if (state.user) {
      state.signOut()
    }
  })

  sync.subscribe('auth-update', (data) => {
    const state = useAuthStore.getState()
    if (state.user && data.profile) {
      useAuthStore.setState({ profile: data.profile })
    }
  })
}

// Register listeners on module load (client only)
if (typeof window !== 'undefined') {
  // Delay slightly to ensure store is created
  setTimeout(registerListeners, 0)
}
