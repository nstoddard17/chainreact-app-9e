"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
// Using @supabase/ssr via supabaseClient (migrated from deprecated @supabase/auth-helpers-nextjs)
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { supabase } from "@/utils/supabaseClient"
import { useEffect } from "react"
import { getCrossTabSync } from "@/lib/utils/cross-tab-sync"

import { logger } from '@/lib/utils/logger'

interface User {
  id: string
  email: string
  name?: string
  first_name?: string
  last_name?: string
  full_name?: string
  avatar?: string
}

interface Profile {
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

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  initialized: boolean
  error: string | null
  hydrated: boolean
  initialize: () => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  updateDefaultWorkspace: (workspaceType: 'personal' | 'team' | 'organization' | null, workspaceId?: string | null) => Promise<void>
  clearDefaultWorkspace: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, metadata?: Record<string, any>) => Promise<void>
  signInWithGoogle: () => Promise<void>
  getCurrentUserId: () => string | null
  setHydrated: () => void
  checkUsernameAndRedirect: () => void
  refreshSession: () => Promise<boolean>
  isAuthenticated: () => boolean
  resetInitialization: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      loading: false,
      initialized: false,
      error: null,
      hydrated: false,

      setHydrated: () => {
        set({ hydrated: true })
      },

      resetInitialization: () => {
        set({ initialized: false })
      },

      initialize: async () => {
        const state = get()

        logger.debug('🔐 [AUTH] Initialize called', {
          initialized: state.initialized,
          loading: state.loading,
          hasUser: !!state.user,
          hasProfile: !!state.profile,
          timestamp: new Date().toISOString()
        })

        // IMPORTANT: Don't skip if we have user from localStorage but haven't verified session yet
        // This ensures each tab independently verifies the session with Supabase
        // Only skip if we're currently loading to prevent concurrent initializations
        if (state.loading) {
          logger.debug('⏭️ [AUTH] Currently loading, skipping to avoid concurrent initialization', {
            loading: state.loading
          })
          return
        }

        // If we think we're initialized but don't have a user, force re-initialization
        // This handles the case where localStorage says initialized but session is actually invalid
        if (state.initialized && !state.user) {
          logger.debug('⚠️ [AUTH] Initialized but no user, forcing re-initialization')
          set({ initialized: false })
        }

        // If we're already initialized AND have a valid user, verify the session is still valid
        if (state.initialized && state.user) {
          logger.debug('🔍 [AUTH] Already initialized with user, verifying session validity')
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              logger.debug('✅ [AUTH] Session is valid, skipping full initialization')
              return
            } else {
              logger.warn('⚠️ [AUTH] Session invalid, forcing re-initialization')
              set({ initialized: false, user: null, profile: null })
            }
          } catch (error) {
            logger.error('❌ [AUTH] Error verifying session, forcing re-initialization', error)
            set({ initialized: false, user: null, profile: null })
          }
        }

        // Temporary bypass for debugging
        if (typeof window !== 'undefined' && window.location.search.includes('bypass_auth=true')) {
          logger.warn('Auth bypass enabled - skipping auth initialization')
          set({ loading: false, initialized: true, error: null, user: null })
          return
        }

        // Check if we're in production and experiencing a cold start
        const isProduction = process.env.NODE_ENV === 'production'
        const timeoutDuration = isProduction ? 12000 : 12000 // 12 seconds for both

        // Add timeout protection for initialization
        const initTimeout = setTimeout(() => {
          logger.warn('Auth initialization timed out, forcing completion...')
          set({ loading: false, initialized: true, error: null, user: null })
        }, timeoutDuration)
        let initTimeoutCleared = false
        const clearInitTimeout = () => {
          if (!initTimeoutCleared) {
            clearTimeout(initTimeout)
            initTimeoutCleared = true
          }
        }

        try {
          set({ loading: true, error: null })

          // Handle hash fragment for magic links
          if (typeof window !== 'undefined') {
            const hash = window.location.hash
            if (hash && hash.includes('access_token')) {
              // Extract access token from hash
              const urlParams = new URLSearchParams(hash.substring(1));
              const accessToken = urlParams.get('access_token');
              const refreshToken = urlParams.get('refresh_token');
              
              if (accessToken && refreshToken) {
                const { data, error } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                });
                
                if (error) {
                  logger.warn('Failed to apply Supabase magic link session:', error)
                } else if (data.session) {
                  // Clear the hash
                  window.location.hash = ''
                  // Redirect to workflows
                  window.location.href = '/workflows'
                  clearInitTimeout()
                  return
                }
              }
            }
          }

          // Get session from local storage (fast, no network call)
          // This is the recommended approach for client-side auth initialization
          logger.debug('🔍 [AUTH] Fetching session from Supabase...', {
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            timestamp: new Date().toISOString()
          })

          const { data: { session }, error: sessionError } = await supabase.auth.getSession()

          logger.debug('📊 [AUTH] Session fetch result', {
            hasSession: !!session,
            hasError: !!sessionError,
            error: sessionError,
            sessionUserId: session?.user?.id,
            sessionUserEmail: session?.user?.email,
            timestamp: new Date().toISOString()
          })

          if (sessionError) {
            logger.error('❌ [AUTH] Session error', {
              error: sessionError,
              errorMessage: sessionError.message,
              errorName: sessionError.name
            })
            set({ user: null, loading: false, initialized: true })
            clearInitTimeout()
            return
          }

          // Extract user from session (no network call needed)
          const user = session?.user

          if (!user) {
            logger.warn('⚠️ [AUTH] No active session found', {
              hasSession: !!session,
              timestamp: new Date().toISOString()
            })
            set({ user: null, loading: false, initialized: true })
            clearInitTimeout()
            return
          }

          if (user) {
            const userObj: User = {
              id: user.id,
              email: user.email || "",
              name: user.user_metadata?.full_name || user.user_metadata?.name,
              avatar: user.user_metadata?.avatar_url,
            }

            logger.debug('✅ [AUTH] User object created', {
              userId: userObj.id,
              userEmail: userObj.email,
              userName: userObj.name,
              hasAvatar: !!userObj.avatar,
              timestamp: new Date().toISOString()
            })

            clearInitTimeout()
            set({ user: userObj, loading: false, initialized: true, error: null })

            logger.debug('✅ [AUTH] Auth state updated - user authenticated', {
              initialized: true,
              loading: false,
              hasUser: true,
              timestamp: new Date().toISOString()
            })

            // Check if profile exists first, create if it doesn't
            let profile: Profile | null = null

            logger.debug('🔍 [AUTH] Starting profile fetch process', {
              userId: user.id,
              timestamp: new Date().toISOString()
            })

            const mapProfileData = (raw: any): Profile => ({
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
            })

            const fetchProfileViaService = async (): Promise<Profile | null> => {
              if (typeof window === 'undefined') return null

              const abortController = new AbortController()
              const timeoutId = window.setTimeout(() => {
                abortController.abort()
              }, 6000)

              try {
                const response = await fetch('/api/auth/profile', {
                  method: 'GET',
                  credentials: 'include',
                  cache: 'no-store',
                  signal: abortController.signal,
                })

                if (!response.ok) {
                  logger.warn('Service profile endpoint responded with status:', response.status)
                  return null
                }

                const payload = await response.json()
                if (payload?.profile) {
                  return mapProfileData(payload.profile)
                }
                return null
              } catch (error: any) {
                if (error?.name === 'AbortError') {
                  logger.info('Service profile fetch timed out, falling back to direct query')
                } else {
                  logger.error('Failed to fetch profile via service endpoint:', error)
                }
                return null
              } finally {
                clearTimeout(timeoutId)
              }
            }

            const deriveRoleFromMetadata = (): string => {
              const metadata = user.user_metadata || {}
              const explicitRole = metadata.role || metadata.account_role || metadata.membership_role
              if (explicitRole && typeof explicitRole === 'string') return explicitRole
              if (metadata.is_beta_tester === true || metadata.beta_tester === true) return 'beta-pro'
              return 'free'
            }

            try {
              logger.debug('📡 [AUTH] Attempting to fetch profile via service endpoint', {
                userId: user.id,
                timestamp: new Date().toISOString()
              })

              profile = await fetchProfileViaService()

              logger.debug('📊 [AUTH] Service profile fetch result', {
                hasProfile: !!profile,
                profileId: profile?.id,
                profileRole: profile?.role,
                timestamp: new Date().toISOString()
              })

              if (!profile) {
                logger.debug('🔍 Service profile unavailable, attempting direct fetch for user ID:', user.id)
                const fetchResult = await supabase
                  .from('user_profiles')
                  .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, plan, admin, email, created_at, updated_at')
                  .eq('id', user.id)
                  .single()

                logger.debug('📊 Direct profile fetch result:', {
                  hasError: !!fetchResult.error,
                  hasData: !!fetchResult.data,
                  error: fetchResult.error,
                  data: fetchResult.data
                })

                if (fetchResult.error) {
                  logger.debug('⚠️ [AUTH] Profile does not exist, creating new profile', {
                    error: fetchResult.error,
                    userId: user.id,
                    timestamp: new Date().toISOString()
                  })

                  const isGoogleUser =
                    user.app_metadata?.provider === 'google' ||
                    user.app_metadata?.providers?.includes('google') ||
                    user.identities?.some((id) => id.provider === 'google')

                  let firstName = user.user_metadata?.given_name || ''
                  let lastName = user.user_metadata?.family_name || ''
                  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || ''

                  if ((!firstName || !lastName) && fullName) {
                    const nameParts = fullName.split(' ')
                    firstName = firstName || nameParts[0] || ''
                    lastName = lastName || nameParts.slice(1).join(' ') || ''
                  }

                  const derivedRole = deriveRoleFromMetadata()

                  const createProfileData = {
                    id: user.id,
                    full_name: fullName,
                    first_name: firstName,
                    last_name: lastName,
                    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                    email: user.email,
                    provider: isGoogleUser ? 'google' : 'email',
                    role: derivedRole,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    username: isGoogleUser ? null : undefined,
                  }

                  const createResult = await supabase
                    .from('user_profiles')
                    .insert(createProfileData)
                    .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, plan, admin, email, created_at, updated_at')
                    .single()

                  logger.debug('📊 [AUTH] Profile creation result', {
                    hasError: !!createResult.error,
                    hasData: !!createResult.data,
                    error: createResult.error,
                    timestamp: new Date().toISOString()
                  })

                  if (createResult.error) {
                    logger.warn('⚠️ [AUTH] Profile creation failed, using fallback', {
                      error: createResult.error,
                      timestamp: new Date().toISOString()
                    })
                    const detectedProvider =
                      user.app_metadata?.provider ||
                      user.app_metadata?.providers?.[0] ||
                      (user.identities?.some((id) => id.provider === 'google') ? 'google' : 'email')

                    const fallbackFullName =
                      user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'

                    const nameParts = fallbackFullName.split(' ')
                    const fallbackFirstName = nameParts[0] || ''
                    const fallbackLastName = nameParts.slice(1).join(' ') || ''

                    profile = {
                      id: user.id,
                      full_name: fallbackFullName,
                      first_name: fallbackFirstName,
                      last_name: fallbackLastName,
                      avatar_url: user.user_metadata?.avatar_url,
                      email: user.email ?? undefined,
                      provider: detectedProvider,
                      role: derivedRole,
                      username:
                        detectedProvider === 'google' ? null : user.email?.split('@')[0] || 'user',
                    }

                    userObj.first_name = fallbackFirstName
                    userObj.last_name = fallbackLastName
                    userObj.full_name = fallbackFullName
                  } else if (createResult.data) {
                    logger.debug('✅ [AUTH] Profile created successfully', {
                      profileId: createResult.data.id,
                      role: createResult.data.role,
                      timestamp: new Date().toISOString()
                    })
                    const createdProfileData = createResult.data
                    userObj.first_name = createdProfileData.first_name
                    userObj.last_name = createdProfileData.last_name
                    userObj.full_name = createdProfileData.full_name || userObj.name
                    profile = mapProfileData(createdProfileData)
                  } else {
                    throw new Error('No profile data returned from creation')
                  }
                } else if (fetchResult.data) {
                  logger.debug('✅ [AUTH] Profile fetched from database', {
                    profileId: fetchResult.data.id,
                    role: fetchResult.data.role,
                    timestamp: new Date().toISOString()
                  })
                  const fetchedProfileData = fetchResult.data
                  userObj.first_name = fetchedProfileData.first_name
                  userObj.last_name = fetchedProfileData.last_name
                  userObj.full_name = fetchedProfileData.full_name || userObj.name
                  profile = mapProfileData(fetchedProfileData)
                }

                // After fallback attempts, profile should be defined. Avoid a second service call to
                // prevent chaining two 6s timeouts that trip the global 12s auth watchdog.
              }

              if (!profile) {
                logger.error('❌ [AUTH] Profile was not properly initialized', {
                  timestamp: new Date().toISOString()
                })
                throw new Error('Profile was not properly initialized')
              }

              if (!profile.role) {
                logger.debug('⚠️ [AUTH] Profile missing role, deriving from metadata', {
                  timestamp: new Date().toISOString()
                })
                profile.role = deriveRoleFromMetadata()
              }

              const currentProfile = get().profile
              const currentUpdatedAt = currentProfile?.updated_at ? Date.parse(currentProfile.updated_at) : NaN
              const fetchedUpdatedAt = profile.updated_at ? Date.parse(profile.updated_at) : NaN

              if (
                currentProfile &&
                !Number.isNaN(currentUpdatedAt) &&
                !Number.isNaN(fetchedUpdatedAt) &&
                currentUpdatedAt > fetchedUpdatedAt
              ) {
                logger.debug('⏭️ [AUTH] Skipping profile overwrite with stale data', {
                  existingUpdatedAt: currentProfile.updated_at,
                  fetchedUpdatedAt: profile.updated_at,
                  timestamp: new Date().toISOString()
                })
              } else {
                logger.debug('✅ [AUTH] Setting profile in state', {
                  profileId: profile.id,
                  role: profile.role,
                  hasUsername: !!profile.username,
                  timestamp: new Date().toISOString()
                })
                set({ profile })
              }

              // Check for missing username and redirect if needed
              setTimeout(() => {
                get().checkUsernameAndRedirect()
              }, 100)

              // Set current user ID in integration store (reduced delay)
              setTimeout(async () => {
                try {
                  const { useIntegrationStore } = await import("./integrationStore")
                  useIntegrationStore.getState().setCurrentUserId(user.id)
                } catch (error) {
                  logger.error("Error updating integration store user ID on init:", error)
                }
              }, 50) // Reduced from 100ms to 50ms

              // Start lightweight background data preloading (only essential data)
              setTimeout(async () => {
                try {
                  const { useIntegrationStore } = await import("./integrationStore")
                  const integrationStore = useIntegrationStore.getState()

                  // Only start if not already started and only fetch basic integration list
                  if (!integrationStore.preloadStarted && !integrationStore.globalPreloadingData) {
                    // Don't force refresh on initial load to avoid conflicts
                    await integrationStore.fetchIntegrations(false)
                  }
                } catch (error) {
                  logger.debug("Background integration preload skipped:", error.message)
                  // Don't fail auth initialization for background preload errors
                }
              }, 3000) // Increased delay to prioritize UI responsiveness and avoid conflicts
            } catch (profileError) {
              logger.error('❌ [AUTH] Profile fetch/creation error', {
                error: profileError,
                errorMessage: profileError?.message,
                timestamp: new Date().toISOString()
              })
              set({ profile: null })
            }
          } else {
            set({ user: null, loading: false, initialized: true })

            // Clear integration store when no user is found
            setTimeout(async () => {
              try {
                const { useIntegrationStore } = await import("./integrationStore")
                const integrationStore = useIntegrationStore.getState()
                integrationStore.setCurrentUserId(null)
                integrationStore.clearAllData()
              } catch (error) {
                logger.error("Error clearing integration store on init:", error)
              }
            }, 50) // Reduced from 100ms to 50ms
          }

          // Set up auth state listener (only once)
          if (!state.initialized) {
            logger.debug('🔗 [AUTH] Setting up auth state change listener', {
              timestamp: new Date().toISOString()
            })

            supabase.auth.onAuthStateChange(async (event, session) => {
              logger.debug('🔔 [AUTH] Auth state changed', {
                event,
                hasSession: !!session,
                hasUser: !!session?.user,
                userId: session?.user?.id,
                timestamp: new Date().toISOString()
              })

              if (event === "SIGNED_IN" && session?.user) {
                logger.debug('✅ [AUTH] User signed in via state change', {
                  userId: session.user.id,
                  email: session.user.email,
                  timestamp: new Date().toISOString()
                })
                const user: User = {
                  id: session.user.id,
                  email: session.user.email || "",
                  name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                  avatar: session.user.user_metadata?.avatar_url,
                }

                // Fetch additional profile data from user_profiles table
                const { data: profileData, error: profileError } = await supabase
                  .from('user_profiles')
                  .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, admin, email, created_at, updated_at')
                  .eq('id', session.user.id)
                  .single()

                let profile: Profile
                
                if (profileError) {
                  // Try fetching without the role/admin column in case they don't exist yet
                  const fallbackResult = await supabase
                    .from('user_profiles')
                    .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, email, created_at, updated_at')
                    .eq('id', session.user.id)
                    .single()
                  
                  if (fallbackResult.error) {
                    // Create a new profile if none exists
                    const detectedProvider = session.user.app_metadata?.provider || 
                                           session.user.app_metadata?.providers?.[0] || 
                                           (session.user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                    
                    profile = {
                      id: session.user.id,
                      full_name: user.name,
                      avatar_url: user.avatar,
                      email: session.user.email ?? undefined,
                      provider: detectedProvider,
                      role: 'free'
                    }
                  } else {
                    const fallbackProfileData = fallbackResult.data
                    if (fallbackProfileData) {
                      user.first_name = fallbackProfileData.first_name
                      user.last_name = fallbackProfileData.last_name
                      user.full_name = fallbackProfileData.full_name || user.name
                      profile = {
                        ...fallbackProfileData,
                        role: fallbackProfileData.role ?? 'free',
                        email: fallbackProfileData.email ?? session.user.email ?? undefined,
                      }
                    } else {
                      // Create a new profile if none exists
                      const detectedProvider = session.user.app_metadata?.provider || 
                                             session.user.app_metadata?.providers?.[0] || 
                                             (session.user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                      
                      profile = {
                        id: session.user.id,
                        full_name: user.name,
                        avatar_url: user.avatar,
                        email: session.user.email ?? undefined,
                        provider: detectedProvider,
                        role: 'free'
                      }
                    }
                  }
                } else if (profileData) {
                  user.first_name = profileData.first_name
                  user.last_name = profileData.last_name
                  user.full_name = profileData.full_name || user.name
                  profile = {
                    ...profileData,
                    email: profileData.email ?? session.user.email ?? undefined,
                  }
                } else {
                  // Create a new profile if none exists
                  const detectedProvider = session.user.app_metadata?.provider || 
                                         session.user.app_metadata?.providers?.[0] || 
                                         (session.user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                  
                  profile = {
                    id: session.user.id,
                    full_name: user.name,
                    avatar_url: user.avatar,
                    email: session.user.email ?? undefined,
                    provider: detectedProvider,
                    role: 'free'
                  }
                }

                const existingProfile = get().profile
                const existingUpdatedAt = existingProfile?.updated_at ? Date.parse(existingProfile.updated_at) : NaN
                const incomingUpdatedAt = profile.updated_at ? Date.parse(profile.updated_at) : NaN
                const keepExisting =
                  existingProfile &&
                  !Number.isNaN(existingUpdatedAt) &&
                  !Number.isNaN(incomingUpdatedAt) &&
                  existingUpdatedAt > incomingUpdatedAt

                if (keepExisting) {
                  logger.debug('⏭️ [AUTH] Preserving newer in-memory profile during auth state change', {
                    existingUpdatedAt: existingProfile.updated_at,
                    incomingUpdatedAt: profile.updated_at,
                    timestamp: new Date().toISOString()
                  })
                }

                set({
                  user,
                  profile:
                    keepExisting ? existingProfile : profile,
                  error: null
                })

                // Broadcast login to other tabs
                if (typeof window !== 'undefined') {
                  const sync = getCrossTabSync()
                  sync.broadcast('auth-login', {
                    userId: user.id,
                    profile: keepExisting ? existingProfile : profile
                  })
                  logger.debug('[AuthStore] Broadcasted login to other tabs')
                }

                // Check for missing username and redirect if needed
                setTimeout(() => {
                  get().checkUsernameAndRedirect()
                }, 100)
                
                // Update integration store with new user ID
                setTimeout(async () => {
                  try {
                    const { useIntegrationStore } = await import("./integrationStore")
                    useIntegrationStore.getState().setCurrentUserId(session.user.id)
                  } catch (error) {
                    logger.error("Error updating integration store user ID:", error)
                  }
                }, 100)
              } else if (event === "SIGNED_OUT") {
                logger.debug('🚪 [AUTH] User signed out via state change', {
                  timestamp: new Date().toISOString()
                })
                set({ user: null, profile: null, loading: false, error: null })
                
                // Clear integration store when user signs out
                setTimeout(async () => {
                  try {
                    const { useIntegrationStore } = await import("./integrationStore")
                    const integrationStore = useIntegrationStore.getState()
                    integrationStore.setCurrentUserId(null)
                    integrationStore.clearAllData()
                  } catch (error) {
                    logger.error("Error clearing integration store on sign out:", error)
                  }
                }, 100)
              }
            })

            // Add visibility change listener to handle tab switching
            // Only re-initialize if the tab has been hidden for a significant time
            // to prevent race conditions between multiple tabs
            if (typeof window !== 'undefined') {
              logger.debug('👁️ [AUTH] Setting up visibility change listener', {
                timestamp: new Date().toISOString()
              })

              let lastVisibilityChange = Date.now()
              const handleVisibilityChange = () => {
                logger.debug('👁️ [AUTH] Visibility changed', {
                  visibilityState: document.visibilityState,
                  timestamp: new Date().toISOString()
                })

                if (document.visibilityState === 'hidden') {
                  lastVisibilityChange = Date.now()
                } else if (document.visibilityState === 'visible') {
                  // Only check session if tab was hidden for more than 5 minutes
                  // This prevents race conditions when quickly switching between tabs
                  const timeSinceHidden = Date.now() - lastVisibilityChange
                  const FIVE_MINUTES = 5 * 60 * 1000

                  if (timeSinceHidden < FIVE_MINUTES) {
                    logger.debug('⏭️ [AUTH] Tab was only hidden briefly, skipping session check', {
                      timeSinceHidden,
                      timestamp: new Date().toISOString()
                    })
                    return
                  }

                  setTimeout(async () => {
                    logger.debug('🔍 [AUTH] Tab became visible after extended absence, checking session', {
                      timeSinceHidden,
                      timestamp: new Date().toISOString()
                    })

                    // Use getSession instead of getUser to avoid network timeout
                    const { data: { session } } = await supabase.auth.getSession()
                    const currentState = get()

                    logger.debug('📊 [AUTH] Visibility session check', {
                      hasSession: !!session,
                      hasUser: !!session?.user,
                      currentStateHasUser: !!currentState.user,
                      timestamp: new Date().toISOString()
                    })

                    // Only re-initialize if we have a session but no user in state
                    if (session?.user && !currentState.user) {
                      logger.debug('🔄 [AUTH] Reinitializing auth after extended absence', {
                        timestamp: new Date().toISOString()
                      })
                      setTimeout(() => {
                        get().initialize()
                      }, 100)
                    }
                  }, 500)
                }
              }

              document.addEventListener('visibilitychange', handleVisibilityChange)
            }
          }
        } catch (error: any) {
          logger.error('❌ [AUTH] Initialize error', {
            error,
            errorMessage: error?.message,
            errorStack: error?.stack,
            timestamp: new Date().toISOString()
          })
          set({ user: null, error: error.message, loading: false, initialized: true })
        } finally {
          logger.debug('🏁 [AUTH] Initialize complete', {
            timestamp: new Date().toISOString()
          })
          clearInitTimeout()
        }
      },

      signOut: async () => {
        try {
          logger.debug("🔐 Starting sign out process...")
          
          // Clear local state immediately and mark as signed out
          set({ 
            user: null, 
            profile: null, 
            loading: false, 
            error: null, 
            initialized: true, // Keep initialized as true to prevent re-initialization
            hydrated: true 
          })
          
          logger.debug("✅ Local state cleared")

          // Clear localStorage immediately to prevent rehydration
          if (typeof window !== 'undefined') {
            localStorage.removeItem('chainreact-auth')
            localStorage.removeItem('pendingSignup')
            
            // Clear any Supabase session data that might be cached
            const keys = Object.keys(localStorage)
            keys.forEach(key => {
              if (key.startsWith('sb-') || key.includes('supabase')) {
                localStorage.removeItem(key)
              }
            })
          }

          // Clear all stores immediately
          try {
            // Clear integration store
            const { useIntegrationStore } = await import("./integrationStore")
            const integrationStore = useIntegrationStore.getState()
            integrationStore.setCurrentUserId(null)
            integrationStore.clearAllData()
            
            // Clear other stores if they exist
            try {
              const { useWorkflowStore } = await import("./workflowStore")
              const workflowStore = useWorkflowStore.getState()
              if (workflowStore.clearAllData) {
                workflowStore.clearAllData()
              }
            } catch (e) {
              // Workflow store might not exist, ignore
            }
            
            try {
              const { useAnalyticsStore } = await import("./analyticsStore")
              const analyticsStore = useAnalyticsStore.getState()
              if (analyticsStore.clearAllData) {
                analyticsStore.clearAllData()
              }
            } catch (e) {
              // Analytics store might not exist, ignore
            }
            
            try {
              const { useAdminStore } = await import("./adminStore")
              const adminStore = useAdminStore.getState()
              if (adminStore.clearAllData) {
                adminStore.clearAllData()
              }
            } catch (e) {
              // Admin store might not exist, ignore
            }

            try {
              const { useBillingStore } = await import("./billingStore")
              const billingStore = useBillingStore.getState()
              if (billingStore.clearAllData) {
                billingStore.clearAllData()
              }
            } catch (e) {
              // Billing store might not exist, ignore
            }
          } catch (error) {
            logger.error("Error clearing stores:", error)
          }
          
          // Stop any ongoing activities by dispatching a custom event
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('user-signout'))

            // Broadcast logout to other tabs
            const sync = getCrossTabSync()
            sync.broadcast('auth-logout', {})
            logger.debug('[AuthStore] Broadcasted logout to other tabs')
          }

          // Note: Navigation is handled by the component calling signOut
          // This ensures proper Next.js router usage
          logger.debug("🚀 Sign out complete, navigation handled by caller")

          // Sign out from Supabase in the background (don't wait)
          logger.debug("🔄 Signing out from Supabase...")
          supabase.auth.signOut().then(() => {
            logger.debug("✅ Supabase sign out successful")
          }).catch((error) => {
            logger.error("❌ Supabase sign out error:", error)
          })
          
        } catch (error: any) {
          logger.error("Sign out error:", error)
          
          // Clear everything even if sign out failed
          set({ 
            user: null, 
            profile: null, 
            loading: false, 
            error: null, 
            initialized: true, // Keep initialized to show signed out state
            hydrated: true 
          })
          
          // Clear localStorage even if sign out failed
          if (typeof window !== 'undefined') {
            localStorage.removeItem('chainreact-auth')
            localStorage.removeItem('pendingSignup')
            
            // Clear any Supabase session data
            const keys = Object.keys(localStorage)
            keys.forEach(key => {
              if (key.startsWith('sb-') || key.includes('supabase')) {
                localStorage.removeItem(key)
              }
            })
            
            // Note: Navigation is handled by the component calling signOut
          }
        }
      },

      updateProfile: async (updates: Partial<Profile>) => {
        try {
          const { user } = get()
          if (!user) throw new Error("No user logged in")

          const updatedAt = new Date().toISOString()

          // First, update the user_profiles table with all profile fields
          // Do this BEFORE updating auth metadata so when auth state change refetches,
          // the database will already have the new data
          const { error: profileError } = await supabase
            .from('user_profiles')
            .upsert({
              id: user.id,
              full_name: updates.full_name,
              first_name: updates.first_name,
              last_name: updates.last_name,
              username: updates.username,
              email: updates.email || user.email,  // Include email, fallback to user's email
              company: updates.company,
              job_title: updates.job_title,
              secondary_email: updates.secondary_email,
              phone_number: updates.phone_number,
              provider: updates.provider,
              avatar_url: updates.avatar_url,
              updated_at: updatedAt,
            }, {
              onConflict: 'id'
            })

          if (profileError) throw profileError

          // Then, update the user metadata in Supabase Auth
          // This will trigger onAuthStateChange which will refetch the profile
          const { error: authError } = await supabase.auth.updateUser({
            data: {
              full_name: updates.full_name,
              avatar_url: updates.avatar_url,
            },
          })

          if (authError) throw authError

          // Update the local state
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

          set({
            user: updatedUser,
            profile: updatedProfile,
          })

          // Broadcast profile update to other tabs
          if (typeof window !== 'undefined') {
            const sync = getCrossTabSync()
            sync.broadcast('auth-update', {
              profile: updatedProfile
            })
            logger.debug('[AuthStore] Broadcasted profile update to other tabs')
          }
        } catch (error: any) {
          logger.error("Profile update error:", error)
          set({ error: error.message })
          throw error
        }
      },

      updateDefaultWorkspace: async (workspaceType: 'personal' | 'team' | 'organization' | null, workspaceId?: string | null) => {
        try {
          const { user, profile } = get()
          if (!user) throw new Error("No user logged in")

          logger.debug('[AuthStore] Updating default workspace:', { workspaceType, workspaceId })

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

          // Update local profile state
          set({
            profile: {
              ...profile,
              default_workspace_type: workspaceType,
              default_workspace_id: workspaceId || null
            } as Profile
          })

          logger.info('[AuthStore] Default workspace updated successfully')
        } catch (error: any) {
          logger.error('[AuthStore] Error updating default workspace:', error)
          throw error
        }
      },

      clearDefaultWorkspace: async () => {
        try {
          const { user, profile } = get()
          if (!user) throw new Error("No user logged in")

          logger.debug('[AuthStore] Clearing default workspace')

          const response = await fetch('/api/user/default-workspace', {
            method: 'DELETE'
          })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to clear default workspace')
          }

          // Update local profile state
          set({
            profile: {
              ...profile,
              default_workspace_type: null,
              default_workspace_id: null
            } as Profile
          })

          logger.info('[AuthStore] Default workspace cleared successfully')
        } catch (error: any) {
          logger.error('[AuthStore] Error clearing default workspace:', error)
          throw error
        }
      },

      signIn: async (email: string, password: string) => {
        logger.debug('🔐 Starting sign in process for:', email)

        // Add timeout protection for the entire sign-in process
        const signInTimeout = setTimeout(() => {
          logger.error('Sign-in timed out after 10 seconds')
          set({ error: 'Sign-in timed out. Please try again.', loading: false })
        }, 10000) // 10 second timeout

        try {
          set({ loading: true, error: null })

          logger.debug('📡 Calling Supabase signInWithPassword...')
          // Sign in with timeout protection
          const signInPromise = supabase.auth.signInWithPassword({
            email,
            password,
          })

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Sign-in timeout')), 8000) // 8 second timeout
          )

          let result
          try {
            result = await Promise.race([signInPromise, timeoutPromise])
          } catch (timeoutError) {
            clearTimeout(signInTimeout)
            logger.error('Sign-in request timed out:', timeoutError)
            set({ error: 'Sign-in timed out. Please try again.', loading: false })
            throw new Error('Sign-in timed out. Please try again.')
          }

          const { data, error } = result
          logger.debug('📥 Sign in response:', {
            hasData: !!data,
            hasUser: !!data?.user,
            hasSession: !!data?.session,
            error: error?.message
          })

          if (error) {
            logger.error('❌ Sign in error:', error)
            clearTimeout(signInTimeout)
            // Make sure to reset loading state before throwing
            set({ error: error.message, loading: false })
            throw error
          }

          if (data.user) {
            logger.debug('✅ User signed in successfully:', data.user.id)
            const user: User = {
              id: data.user.id,
              email: data.user.email || "",
              name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
              avatar: data.user.user_metadata?.avatar_url,
            }

            // Set user immediately for better UX
            clearTimeout(signInTimeout)
            set({ user, profile: null, loading: false, initialized: true })

            // Fetch profile data in background after successful login
            // Use the shared fetchProfile function to ensure consistent behavior and cache bypass
            const fetchProfileAsync = async () => {
              try {
                const { useAuthStore } = await import('./authStore')
                const store = useAuthStore.getState()
                // Force fresh fetch by bypassing cache (set lastProfileFetch to 0)
                store.lastProfileFetch = 0
                await store.fetchProfile(data.user.id)
                logger.debug('Profile loaded successfully in background with cache bypass')
              } catch (profileError) {
                logger.warn('Profile fetch failed in background:', profileError)
              }
            }
            fetchProfileAsync()

            // Update integration store with new user ID after successful login
            setTimeout(async () => {
              try {
                const { useIntegrationStore } = await import("./integrationStore")
                useIntegrationStore.getState().setCurrentUserId(data.user.id)
              } catch (error) {
                logger.error("Error updating integration store user ID after login:", error)
              }
            }, 100)

            return { user, profile: null }
          }
          
          // If no user returned but also no error, still reset loading
          set({ loading: false })
          throw new Error("Login failed - no user data returned")
        } catch (error: any) {
          clearTimeout(signInTimeout) // Clear timeout on any error
          logger.error("Sign in error:", error)
          // Ensure loading is always reset on any error
          set({ error: error.message, loading: false })
          throw error
        } finally {
          clearTimeout(signInTimeout) // Ensure timeout is always cleared
        }
      },

      signUp: async (email: string, password: string, metadata?: Record<string, any>) => {
        try {
          set({ loading: true, error: null })

          // Set up email confirmation URL with explicit type parameter
          // In development, use localhost; in production, use the actual domain
          let baseUrl: string
          if (typeof window !== 'undefined') {
            baseUrl = window.location.origin
          } else if (process.env.NODE_ENV === 'development') {
            baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
          } else {
            baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://chainreact.app'
          }
          
          logger.debug('Signing up with email redirect to:', `${baseUrl}/api/auth/callback?type=email-confirmation`)
          
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: metadata || {},
              emailRedirectTo: `${baseUrl}/api/auth/callback?type=email-confirmation`
            },
          })

          if (error) throw error

          // Store signup data temporarily for the waiting page
          if (data.user) {
            // Create the user profile immediately with username and email
            const profileData = {
              id: data.user.id,
              username: metadata?.username,
              first_name: metadata?.first_name,
              last_name: metadata?.last_name,
              full_name: metadata?.full_name,
              email: email,  // Store the primary email
              provider: 'email',
              role: 'free',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }

            // Try to create the profile
            const { error: profileError } = await supabase
              .from('user_profiles')
              .insert(profileData)

            if (profileError) {
              logger.error('Error creating profile during signup:', profileError)
              // Don't throw - profile can be created later if needed
            }

            localStorage.setItem('pendingSignup', JSON.stringify({
              userId: data.user.id,
              email: data.user.email,
              metadata: metadata,
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

          // Use Supabase's built-in Google OAuth
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/api/auth/callback`,
            },
          })

          if (error) {
            throw error
          }

          // Supabase handles the redirect automatically
          // No need for manual redirect
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
        // Check if Google user needs username setup
        if (state.profile && 
            state.profile.provider === 'google' && 
            (!state.profile.username || state.profile.username.trim() === '')) {
          // Redirect to username setup page for Google users
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/auth/setup-username')) {
            window.location.href = '/auth/setup-username'
          }
        }
      },

      refreshSession: async () => {
        logger.debug('🔄 [AUTH] Refreshing session', {
          timestamp: new Date().toISOString()
        })

        try {
          const { data: { session }, error } = await supabase.auth.refreshSession()

          logger.debug('📊 [AUTH] Session refresh result', {
            hasSession: !!session,
            hasUser: !!session?.user,
            hasError: !!error,
            error: error,
            timestamp: new Date().toISOString()
          })

          if (error) {
            logger.error("❌ [AUTH] Session refresh error:", error)
            return false
          }

          if (session?.user) {
            logger.debug('✅ [AUTH] Session refreshed successfully', {
              userId: session.user.id,
              timestamp: new Date().toISOString()
            })
            // Update the user state with the refreshed session (user already in session)
            const user = session.user
            set({ user: {
              id: user.id,
              email: user.email || '',
              name: user.user_metadata?.name,
              first_name: user.user_metadata?.first_name,
              last_name: user.user_metadata?.last_name,
              full_name: user.user_metadata?.full_name,
              avatar: user.user_metadata?.avatar_url,
            }})
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
        const authenticated = !!(state.user && state.user.id)
        logger.debug('🔐 [AUTH] isAuthenticated check', {
          authenticated,
          hasUser: !!state.user,
          userId: state.user?.id,
          initialized: state.initialized,
          loading: state.loading,
          timestamp: new Date().toISOString()
        })
        return authenticated
      },
    }),
    {
      name: "chainreact-auth",
      version: 2, // Increment this when store structure changes to auto-clear stale data
      migrate: (persistedState: any, version: number) => {
        // If persisted version doesn't match current version, clear the state
        // This prevents stale localStorage data from causing auth issues
        if (version !== 2) {
          logger.warn('🔄 [AUTH] Persisted state version mismatch, clearing stale data', {
            persistedVersion: version,
            currentVersion: 2,
            timestamp: new Date().toISOString()
          })
          return {
            user: null,
            profile: null,
            loading: false,
            initialized: false,
            error: null,
            hydrated: false
          }
        }
        return persistedState
      },
      storage: {
        getItem: (name) => {
          try {
            // Check if we're on the client side
            if (typeof window === 'undefined') {
              return null
            }

            const str = localStorage.getItem(name)
            if (!str) return null

            // Validate the stored data before parsing
            if (str.startsWith('base64-') || str.includes('eyJ')) {
              logger.warn('Detected corrupted auth data, clearing...')
              localStorage.removeItem(name)
              return null
            }

            // Try to parse the JSON
            const data = JSON.parse(str)

            // Validate the structure
            if (data && typeof data === 'object' && data.state) {
              return str
            }

            // If invalid structure, clear it
            logger.warn('Invalid auth data structure, clearing...')
            localStorage.removeItem(name)
            return null
          } catch (error) {
            logger.error('Error reading auth storage:', error)
            // Clear corrupted data only if we're on the client
            if (typeof window !== 'undefined') {
              localStorage.removeItem(name)
            }
            return null
          }
        },
        setItem: (name, value) => {
          try {
            // Check if we're on the client side
            if (typeof window === 'undefined') {
              return
            }
            
            // Ensure value is a string
            let stringValue = value
            if (typeof value !== 'string') {
              stringValue = JSON.stringify(value)
            }
            
            // Validate it's valid JSON
            JSON.parse(stringValue)
            localStorage.setItem(name, stringValue)
          } catch (error: any) {
            // Silently ignore localStorage errors (quota exceeded, private browsing, etc.)
            // These are non-critical and will be retried on next state change
            if (error?.name === 'QuotaExceededError') {
              console.warn('LocalStorage quota exceeded - auth state may not persist')
            } else if (error instanceof SyntaxError) {
              logger.error('Invalid JSON in auth storage:', { name, error: error.message })
            }
            // Ignore other localStorage errors as they're usually environmental
          }
        },
        removeItem: (name) => {
          // Check if we're on the client side
          if (typeof window === 'undefined') {
            return
          }
          localStorage.removeItem(name)
        },
      },
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
      }),
      onRehydrateStorage: () => (state) => {
        logger.debug('💧 [AUTH] Rehydrating auth state from storage', {
          hasState: !!state,
          hasUser: !!state?.user,
          initialized: state?.initialized,
          timestamp: new Date().toISOString()
        })

        try {
          // Mark as hydrated immediately and reset initialization so each reload revalidates
          state?.setHydrated()
          state?.resetInitialization()

          logger.debug('💧 [AUTH] State hydrated and reset', {
            hasUser: !!state?.user,
            userId: state?.user?.id,
            initialized: state?.initialized,
            timestamp: new Date().toISOString()
          })

          // Set up cross-tab synchronization via storage events
          if (state && typeof window !== 'undefined') {
            const handleStorageChange = (event: StorageEvent) => {
              // Only handle changes to our auth store
              if (event.key !== 'chainreact-auth') return

              logger.debug('🔄 [AUTH] Storage event detected from another tab', {
                key: event.key,
                hasNewValue: !!event.newValue,
                timestamp: new Date().toISOString()
              })

              try {
                if (event.newValue) {
                  const newData = JSON.parse(event.newValue)
                  const newState = newData?.state

                  // If another tab just authenticated, adopt that session
                  if (newState?.user && newState?.profile) {
                    const currentState = useAuthStore.getState()

                    // Only adopt if we don't have a user yet or if the user changed
                    if (!currentState.user || currentState.user.id !== newState.user.id) {
                      logger.debug('✅ [AUTH] Adopting session from another tab', {
                        userId: newState.user.id,
                        timestamp: new Date().toISOString()
                      })

                      useAuthStore.setState({
                        user: newState.user,
                        profile: newState.profile,
                        initialized: true,
                        loading: false,
                        error: null,
                      })
                    }
                  }
                }
              } catch (error) {
                logger.error('Error handling storage change:', error)
              }
            }

            window.addEventListener('storage', handleStorageChange)
          }

          // Only initialize if not already initialized and we're on the client
          if (state && !state.initialized && typeof window !== 'undefined') {
            logger.debug('🚀 [AUTH] Scheduling initialization after rehydration', {
              timestamp: new Date().toISOString()
            })
            // Use requestIdleCallback if available, otherwise setTimeout
            const scheduleInit = () => {
              if ('requestIdleCallback' in window) {
                (window as any).requestIdleCallback(() => state.initialize(), { timeout: 100 })
              } else {
                setTimeout(() => state.initialize(), 50)
              }
            }
            scheduleInit()
          } else {
            logger.debug('⏭️ [AUTH] Skipping initialization', {
              hasState: !!state,
              alreadyInitialized: state?.initialized,
              isClient: typeof window !== 'undefined',
              timestamp: new Date().toISOString()
            })
          }
        } catch (error) {
          logger.error('❌ [AUTH] Error during rehydration:', {
            error,
            errorMessage: error?.message,
            timestamp: new Date().toISOString()
          })
          // Clear any corrupted state only if we're on the client
          if (typeof window !== 'undefined') {
            logger.warn('⚠️ [AUTH] Clearing corrupted localStorage', {
              timestamp: new Date().toISOString()
            })
            try {
              localStorage.removeItem('chainreact-auth')
            } catch (e) {
              logger.error('Failed to clear localStorage:', e)
            }
          }
          // Still mark as hydrated to prevent blocking
          state?.setHydrated()
        }
      },
    },
  ),
)

// Initialize cross-tab synchronization for auth state
if (typeof window !== 'undefined') {
  const sync = getCrossTabSync()

  // Listen for login events from other tabs
  sync.subscribe('auth-login', (data) => {
    logger.debug('[AuthStore] Received login event from another tab', data)
    const state = useAuthStore.getState()
    if (!state.user || state.user.id !== data.userId) {
      // Re-initialize to fetch the new user
      state.initialize()
    }
  })

  // Listen for logout events from other tabs
  sync.subscribe('auth-logout', () => {
    logger.debug('[AuthStore] Received logout event from another tab')
    const state = useAuthStore.getState()
    if (state.user) {
      // Sign out without broadcasting (to avoid infinite loop)
      state.signOut()
    }
  })

  // Listen for profile updates from other tabs
  sync.subscribe('auth-update', (data) => {
    logger.debug('[AuthStore] Received profile update from another tab', data)
    const state = useAuthStore.getState()
    if (state.user && data.profile) {
      // Update local profile state
      useAuthStore.setState({ profile: data.profile })
    }
  })
}
