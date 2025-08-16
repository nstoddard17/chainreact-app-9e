"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { supabase } from "@/utils/supabaseClient"
import { useEffect } from "react"

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
  provider?: string
  role?: string
  created_at?: string
  updated_at?: string
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
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, metadata?: Record<string, any>) => Promise<void>
  signInWithGoogle: () => Promise<void>
  getCurrentUserId: () => string | null
  setHydrated: () => void
  checkUsernameAndRedirect: () => void
  refreshSession: () => Promise<boolean>
  isAuthenticated: () => boolean
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

      initialize: async () => {
        const state = get()
        if (state.initialized || state.loading) {
          return
        }

        // Add timeout protection for initialization
        const initTimeout = setTimeout(() => {
          set({ loading: false, initialized: true, error: "Initialization timed out" })
        }, 12000) // Increased from 5 seconds to 12 seconds

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
                } else if (data.session) {
                  // Clear the hash
                  window.location.hash = ''
                  // Redirect to dashboard
                  window.location.href = '/dashboard'
                  clearTimeout(initTimeout)
                  return
                }
              }
            }
          }

          // Get current user from Supabase with timeout
          const userPromise = supabase.auth.getUser()
          const userTimeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('User fetch timeout')), 8000) // Increased from 3 seconds to 8 seconds
          )
          
          let userResult
          try {
            userResult = await Promise.race([userPromise, userTimeout])
          } catch (timeoutError) {
            // Try one more time without timeout as fallback
            try {
              userResult = await userPromise
            } catch (fallbackError) {
              set({ user: null, loading: false, initialized: true })
              clearTimeout(initTimeout)
              return
            }
          }
          
          const { data: { user }, error: userError } = userResult

          if (userError) {
            set({ user: null, loading: false, initialized: true })
            clearTimeout(initTimeout)
            return
          }

          if (user) {
            const userObj: User = {
              id: user.id,
              email: user.email || "",
              name: user.user_metadata?.full_name || user.user_metadata?.name,
              avatar: user.user_metadata?.avatar_url,
            }

            // Check if profile exists first, create if it doesn't
            let profile: Profile | null = null
            
            try {
              // First, try to fetch existing profile
              const fetchResult = await supabase
                .from('user_profiles')
                .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, created_at, updated_at')
                .eq('id', user.id)
                .single()

              if (fetchResult.error) {
                // If fetch fails, try to create a new profile
                const createProfileData = {
                  id: user.id,
                  full_name: userObj.name,
                  avatar_url: userObj.avatar,
                  provider: user.app_metadata?.provider || 
                           user.app_metadata?.providers?.[0] || 
                           (user.identities?.some(id => id.provider === 'google') ? 'google' : 'email'),
                  role: 'free',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }

                const createResult = await supabase
                  .from('user_profiles')
                  .insert(createProfileData)
                  .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, created_at, updated_at')
                  .single()

                if (createResult.error) {
                  // Create a fallback profile from auth metadata
                  const detectedProvider = user.app_metadata?.provider || 
                                         user.app_metadata?.providers?.[0] || 
                                         (user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                      
                  // Extract name from user metadata
                  const fullName = user.user_metadata?.full_name || 
                                  user.user_metadata?.name || 
                                  user.email?.split('@')[0] || 'User'
                      
                  const nameParts = fullName.split(' ')
                  const firstName = nameParts[0] || ''
                  const lastName = nameParts.slice(1).join(' ') || ''
                      
                  profile = {
                    id: user.id,
                    full_name: fullName,
                    first_name: firstName,
                    last_name: lastName,
                    avatar_url: user.user_metadata?.avatar_url,
                    provider: detectedProvider,
                    role: 'free',
                    username: user.email?.split('@')[0] || 'user',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  }
                      
                  // Update user object with extracted data
                  userObj.first_name = firstName
                  userObj.last_name = lastName
                  userObj.full_name = fullName
                } else {
                  const createdProfileData = createResult.data
                  
                  if (createdProfileData) {
                    userObj.first_name = createdProfileData.first_name
                    userObj.last_name = createdProfileData.last_name
                    userObj.full_name = createdProfileData.full_name || userObj.name
                    profile = createdProfileData
                  } else {
                    throw new Error('No profile data returned from creation')
                  }
                }
              } else {
                const fetchedProfileData = fetchResult.data
                
                if (fetchedProfileData) {
                  userObj.first_name = fetchedProfileData.first_name
                  userObj.last_name = fetchedProfileData.last_name
                  userObj.full_name = fetchedProfileData.full_name || userObj.name
                  profile = fetchedProfileData
                } else {
                  throw new Error('No profile data found')
                }
              }

              // Ensure profile is set before continuing
              if (!profile) {
                throw new Error('Profile was not properly initialized')
              }

              set({ user: userObj, profile, loading: false, initialized: true })

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
                  console.error("Error updating integration store user ID on init:", error)
                }
              }, 50) // Reduced from 100ms to 50ms

              // Start lightweight background data preloading (only essential data)
              setTimeout(async () => {
                try {
                  const { useIntegrationStore } = await import("./integrationStore")
                  const integrationStore = useIntegrationStore.getState()

                  // Only start if not already started and only fetch basic integration list
                  if (!integrationStore.preloadStarted && !integrationStore.globalPreloadingData) {
                    await integrationStore.fetchIntegrations(true)
                  }
                } catch (error) {
                  console.error("❌ Lightweight preload failed:", error)
                  // Don't fail auth initialization for background preload errors
                }
              }, 2000) // Increased delay to prioritize UI responsiveness
            } catch (profileError) {
              set({ user: userObj, profile: null, loading: false, initialized: true })
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
                console.error("Error clearing integration store on init:", error)
              }
            }, 50) // Reduced from 100ms to 50ms
          }

          // Set up auth state listener (only once)
          if (!state.initialized) {
            supabase.auth.onAuthStateChange(async (event, session) => {
              if (event === "SIGNED_IN" && session?.user) {
                const user: User = {
                  id: session.user.id,
                  email: session.user.email || "",
                  name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                  avatar: session.user.user_metadata?.avatar_url,
                }

                // Fetch additional profile data from user_profiles table
                const { data: profileData, error: profileError } = await supabase
                  .from('user_profiles')
                  .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, created_at, updated_at')
                  .eq('id', session.user.id)
                  .single()

                let profile: Profile
                
                if (profileError) {
                  // Try fetching without the role column in case it doesn't exist yet
                  const fallbackResult = await supabase
                    .from('user_profiles')
                    .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, created_at, updated_at')
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
                      provider: detectedProvider,
                      role: 'free'
                    }
                  } else {
                    const fallbackProfileData = fallbackResult.data
                    if (fallbackProfileData) {
                      user.first_name = fallbackProfileData.first_name
                      user.last_name = fallbackProfileData.last_name
                      user.full_name = fallbackProfileData.full_name || user.name
                      profile = { ...fallbackProfileData, role: 'free' }
                    } else {
                      // Create a new profile if none exists
                      const detectedProvider = session.user.app_metadata?.provider || 
                                             session.user.app_metadata?.providers?.[0] || 
                                             (session.user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                      
                      profile = {
                        id: session.user.id,
                        full_name: user.name,
                        avatar_url: user.avatar,
                        provider: detectedProvider,
                        role: 'free'
                      }
                    }
                  }
                } else if (profileData) {
                  user.first_name = profileData.first_name
                  user.last_name = profileData.last_name
                  user.full_name = profileData.full_name || user.name
                  profile = profileData
                } else {
                  // Create a new profile if none exists
                  const detectedProvider = session.user.app_metadata?.provider || 
                                         session.user.app_metadata?.providers?.[0] || 
                                         (session.user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                  
                  profile = {
                    id: session.user.id,
                    full_name: user.name,
                    avatar_url: user.avatar,
                    provider: detectedProvider,
                    role: 'free'
                  }
                }

                set({ user, profile, error: null })
                
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
                    console.error("Error updating integration store user ID:", error)
                  }
                }, 100)
              } else if (event === "SIGNED_OUT") {
                set({ user: null, profile: null, loading: false, error: null })
                
                // Clear integration store when user signs out
                setTimeout(async () => {
                  try {
                    const { useIntegrationStore } = await import("./integrationStore")
                    const integrationStore = useIntegrationStore.getState()
                    integrationStore.setCurrentUserId(null)
                    integrationStore.clearAllData()
                  } catch (error) {
                    console.error("Error clearing integration store on sign out:", error)
                  }
                }, 100)
              }
            })

            // Add visibility change listener to handle tab switching
            if (typeof window !== 'undefined') {
              const handleVisibilityChange = () => {
                if (document.visibilityState === 'visible') {
                  setTimeout(async () => {
                    const { data: { user } } = await supabase.auth.getUser()
                    const currentState = get()
                    
                    if (user && !currentState.user) {
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
          set({ user: null, error: error.message, loading: false, initialized: true })
        } finally {
          clearTimeout(initTimeout)
        }
      },

      signOut: async () => {
        try {
          // Clear local state immediately and mark as signed out
          set({ 
            user: null, 
            profile: null, 
            loading: false, 
            error: null, 
            initialized: false, // Reset initialization to prevent auto-login
            hydrated: false 
          })

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

          // Sign out from Supabase and wait for completion
          const { error: signOutError } = await supabase.auth.signOut()
          if (signOutError) {
            console.error("Supabase sign out error:", signOutError)
          }

          // Clear all stores after successful sign out
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
          } catch (error) {
            console.error("Error clearing stores:", error)
          }
          
          // Stop any ongoing activities by dispatching a custom event
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('user-signout'))
          }

          // Force a hard redirect to ensure clean state
          if (typeof window !== 'undefined') {
            window.location.replace('/')
          }
        } catch (error: any) {
          console.error("Sign out error:", error)
          
          // Clear everything even if sign out failed
          set({ 
            user: null, 
            profile: null, 
            loading: false, 
            error: null, 
            initialized: false,
            hydrated: false 
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
          }
          
          // Still redirect even if there's an error
          if (typeof window !== 'undefined') {
            window.location.replace('/')
          }
        }
      },

      updateProfile: async (updates: Partial<Profile>) => {
        try {
          const { user } = get()
          if (!user) throw new Error("No user logged in")

          // First, update the user metadata in Supabase Auth
          const { error: authError } = await supabase.auth.updateUser({
            data: {
              full_name: updates.full_name,
              avatar_url: updates.avatar_url,
            },
          })

          if (authError) throw authError

          // Then, update the user_profiles table with all profile fields
          const { error: profileError } = await supabase
            .from('user_profiles')
            .upsert({
              id: user.id,
              full_name: updates.full_name,
              first_name: updates.first_name,
              last_name: updates.last_name,
              username: updates.username,
              company: updates.company,
              job_title: updates.job_title,
              secondary_email: updates.secondary_email,
              phone_number: updates.phone_number,
              provider: updates.provider,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'id'
            })

          if (profileError) throw profileError

          // Update the local state
          const { profile } = get()
          set({
            user: {
              ...user,
              name: updates.full_name,
              first_name: updates.first_name,
              last_name: updates.last_name,
              full_name: updates.full_name,
            },
            profile: {
              ...profile,
              ...updates,
              id: user.id,
            }
          })
        } catch (error: any) {
          console.error("Profile update error:", error)
          set({ error: error.message })
          throw error
        }
      },

      signIn: async (email: string, password: string) => {
        try {
          set({ loading: true, error: null })

          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          })

          if (error) throw error

          if (data.user) {
            const user: User = {
              id: data.user.id,
              email: data.user.email || "",
              name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
              avatar: data.user.user_metadata?.avatar_url,
            }

            set({ user, loading: false })
          }
        } catch (error: any) {
          console.error("Sign in error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      signUp: async (email: string, password: string, metadata?: Record<string, any>) => {
        try {
          set({ loading: true, error: null })

          // Set up email confirmation URL
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL
          
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: metadata || {},
              emailRedirectTo: `${baseUrl}/auth/confirm`,
            },
          })

          if (error) throw error

          // Store signup data temporarily
          if (data.user) {
            localStorage.setItem('pendingSignup', JSON.stringify({
              userId: data.user.id,
              email: data.user.email,
              metadata: metadata,
              timestamp: Date.now()
            }))

            // Send custom confirmation email via Resend
            try {
              const response = await fetch('/api/auth/send-confirmation', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                  email: data.user.email, 
                  userId: data.user.id,
                  username: metadata?.first_name || metadata?.full_name || 'there'
                }),
              })

              if (!response.ok) {
                console.error('Failed to send custom confirmation email')
              }
            } catch (emailError) {
              console.error('Error sending custom confirmation email:', emailError)
              // Don't throw - let signup continue even if email fails
            }
          }

          set({ loading: false })
        } catch (error: any) {
          console.error("Sign up error:", error)
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
          console.error("Google sign in error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      getCurrentUserId: () => {
        return get().user?.id ?? null
      },

      checkUsernameAndRedirect: () => {
        const state = get()
        if (state.profile && (!state.profile.username || state.profile.username.trim() === '')) {
          // Only redirect if we're not already on the setup-username page
          if (typeof window !== 'undefined' && window.location.pathname !== '/setup-username') {
            window.location.href = '/setup-username'
          }
        }
      },

      refreshSession: async () => {
        try {
          const { data: { session }, error } = await supabase.auth.refreshSession()
          if (error) {
            console.error("Session refresh error:", error)
            return false
          }
          
          if (session) {
            // Update the user state with the refreshed session
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
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
          }
          return false
        } catch (error) {
          console.error("Session refresh failed:", error)
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
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated()

        // Only initialize if not already initialized
        if (state && !state.initialized) {
          setTimeout(() => {
            state.initialize()
          }, 100)
        }
      },
    },
  ),
)
