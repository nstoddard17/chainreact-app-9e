"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { supabase } from "@/utils/supabaseClient"

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
          console.log("Auth already initialized or initializing")
          return
        }

        // Add timeout protection for initialization
        const initTimeout = setTimeout(() => {
          console.error("Auth initialization timed out - forcing completion")
          set({ loading: false, initialized: true, error: "Initialization timed out" })
        }, 12000) // Increased from 5 seconds to 12 seconds

        try {
          set({ loading: true, error: null })
          console.log("🔄 Starting auth initialization...")

          // Handle hash fragment for magic links
          if (typeof window !== 'undefined') {
            const hash = window.location.hash
            console.log("🔍 Checking for magic link hash:", hash ? 'Found hash' : 'No hash');
            if (hash && hash.includes('access_token')) {
              console.log("🔗 Processing magic link hash...")
              console.log("🔍 Hash content:", hash.substring(0, 100) + "...");
              
              // Extract access token from hash
              const urlParams = new URLSearchParams(hash.substring(1));
              const accessToken = urlParams.get('access_token');
              const refreshToken = urlParams.get('refresh_token');
              
              if (accessToken && refreshToken) {
                console.log("🔑 Setting session from tokens...");
                const { data, error } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                });
                
                if (error) {
                  console.error("Error setting session from magic link:", error);
                } else if (data.session) {
                  console.log("✅ Magic link session established")
                  console.log("🔍 Session user:", data.session.user.email);
                  // Clear the hash
                  window.location.hash = ''
                  // Redirect to dashboard
                  console.log("🔄 Redirecting to dashboard...");
                  window.location.href = '/dashboard'
                  clearTimeout(initTimeout)
                  return
                } else {
                  console.log("❌ No session found after setting tokens");
                }
              } else {
                console.log("❌ Missing tokens in hash");
              }
            }
          }

          // Get current session from Supabase with timeout
          const sessionPromise = supabase.auth.getSession()
          const sessionTimeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Session fetch timeout')), 8000) // Increased from 3 seconds to 8 seconds
          )
          
          let sessionResult
          try {
            sessionResult = await Promise.race([sessionPromise, sessionTimeout])
          } catch (timeoutError) {
            console.warn("Session fetch timed out, continuing without session:", timeoutError)
            // Try one more time without timeout as fallback
            try {
              console.log("🔄 Retrying session fetch without timeout...")
              sessionResult = await sessionPromise
            } catch (fallbackError) {
              console.warn("Fallback session fetch also failed:", fallbackError)
              set({ user: null, loading: false, initialized: true })
              clearTimeout(initTimeout)
              return
            }
          }
          
          const { data: { session }, error: sessionError } = sessionResult

          if (sessionError) {
            console.error("Session error:", sessionError)
            // Don't fail completely on session error, just set user to null
            set({ user: null, loading: false, initialized: true })
            clearTimeout(initTimeout)
            return
          }

          if (session?.user) {
            console.log("✅ Found valid session for user")
            const user: User = {
              id: session.user.id,
              email: session.user.email || "",
              name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
              avatar: session.user.user_metadata?.avatar_url,
            }

            // Check if profile exists first, create if it doesn't
            console.log("🔍 Checking if profile exists for user:", session.user.id)
            
            let profile: Profile | null = null
            
            try {
              // First, try to fetch existing profile
              console.log("🔄 Attempting to fetch existing profile...")
              const fetchResult = await supabase
                .from('user_profiles')
                .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, role, created_at, updated_at')
                .eq('id', session.user.id)
                .single()

              if (fetchResult.error) {
                console.error("❌ Profile fetch error:", fetchResult.error)
                console.error("❌ Error details:", JSON.stringify(fetchResult.error, null, 2))
                
                // If fetch fails, try to create a new profile
                console.log("🔄 Attempting to create new profile...")
                const createProfileData = {
                  id: session.user.id,
                  full_name: user.name,
                  avatar_url: user.avatar,
                  provider: session.user.app_metadata?.provider || 
                           session.user.app_metadata?.providers?.[0] || 
                           (session.user.identities?.some(id => id.provider === 'google') ? 'google' : 'email'),
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
                  console.error("❌ Profile creation error:", createResult.error)
                  console.error("❌ Creation error details:", JSON.stringify(createResult.error, null, 2))
                  
                  // Create a fallback profile from auth metadata
                  console.log("🔄 Creating fallback profile from auth metadata...")
                  const detectedProvider = session.user.app_metadata?.provider || 
                                         session.user.app_metadata?.providers?.[0] || 
                                         (session.user.identities?.some(id => id.provider === 'google') ? 'google' : 'email')
                      
                  // Extract name from user metadata
                  const fullName = session.user.user_metadata?.full_name || 
                                  session.user.user_metadata?.name || 
                                  session.user.email?.split('@')[0] || 'User'
                      
                  const nameParts = fullName.split(' ')
                  const firstName = nameParts[0] || ''
                  const lastName = nameParts.slice(1).join(' ') || ''
                      
                  profile = {
                    id: session.user.id,
                    full_name: fullName,
                    first_name: firstName,
                    last_name: lastName,
                    avatar_url: session.user.user_metadata?.avatar_url,
                    provider: detectedProvider,
                    role: 'free',
                    username: session.user.email?.split('@')[0] || 'user',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  }
                      
                  // Update user object with extracted data
                  user.first_name = firstName
                  user.last_name = lastName
                  user.full_name = fullName
                      
                  console.log("✅ Created fallback profile:", profile)
                } else {
                  console.log("✅ Profile creation successful:", createResult.data)
                  const createdProfileData = createResult.data
                  
                  if (createdProfileData) {
                    user.first_name = createdProfileData.first_name
                    user.last_name = createdProfileData.last_name
                    user.full_name = createdProfileData.full_name || user.name
                    profile = createdProfileData
                  } else {
                    throw new Error('No profile data returned from creation')
                  }
                }
              } else {
                console.log("✅ Profile fetch successful:", fetchResult.data)
                const fetchedProfileData = fetchResult.data
                
                if (fetchedProfileData) {
                  user.first_name = fetchedProfileData.first_name
                  user.last_name = fetchedProfileData.last_name
                  user.full_name = fetchedProfileData.full_name || user.name
                  profile = fetchedProfileData
                } else {
                  throw new Error('No profile data found')
                }
              }

              // Ensure profile is set before continuing
              if (!profile) {
                throw new Error('Profile was not properly initialized')
              }

              set({ user, profile, loading: false, initialized: true })

              // Set current user ID in integration store (reduced delay)
              setTimeout(async () => {
                try {
                  const { useIntegrationStore } = await import("./integrationStore")
                  useIntegrationStore.getState().setCurrentUserId(session.user.id)
                  console.log("✅ Integration store updated with existing user ID")
                } catch (error) {
                  console.error("Error updating integration store user ID on init:", error)
                }
              }, 50) // Reduced from 100ms to 50ms

              // Start lightweight background data preloading (only essential data)
              console.log("🚀 Starting lightweight background preload...")
              setTimeout(async () => {
                try {
                  const { useIntegrationStore } = await import("./integrationStore")
                  const integrationStore = useIntegrationStore.getState()

                  // Only start if not already started and only fetch basic integration list
                  if (!integrationStore.preloadStarted && !integrationStore.globalPreloadingData) {
                    await integrationStore.fetchIntegrations(true)
                    console.log("✅ Lightweight preload completed")
                  }
                } catch (error) {
                  console.error("❌ Lightweight preload failed:", error)
                  // Don't fail auth initialization for background preload errors
                }
              }, 2000) // Increased delay to prioritize UI responsiveness
            } catch (profileError) {
              console.error("Profile fetch failed:", profileError)
              // Continue with basic user data - don't fail auth initialization
              set({ user, profile: null, loading: false, initialized: true })
            }
          } else {
            console.log("❌ No valid session found")
            set({ user: null, loading: false, initialized: true })
            
            // Clear integration store when no user is found
            setTimeout(async () => {
              try {
                const { useIntegrationStore } = await import("./integrationStore")
                const integrationStore = useIntegrationStore.getState()
                integrationStore.setCurrentUserId(null)
                integrationStore.clearAllData()
                console.log("✅ Integration store cleared - no user session")
              } catch (error) {
                console.error("Error clearing integration store on init:", error)
              }
            }, 50) // Reduced from 100ms to 50ms
          }

          // Set up auth state listener (only once)
          if (!state.initialized) {
            supabase.auth.onAuthStateChange(async (event, session) => {
              console.log("🔄 Auth state changed:", event)

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
                  console.error("❌ Profile fetch error in auth state change:", profileError)
                  // Try fetching without the role column in case it doesn't exist yet
                  const fallbackResult = await supabase
                    .from('user_profiles')
                    .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, provider, created_at, updated_at')
                    .eq('id', session.user.id)
                    .single()
                  
                  if (fallbackResult.error) {
                    console.error("❌ Fallback profile fetch also failed:", fallbackResult.error)
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
                
                // Update integration store with new user ID
                setTimeout(async () => {
                  try {
                    const { useIntegrationStore } = await import("./integrationStore")
                    useIntegrationStore.getState().setCurrentUserId(session.user.id)
                    console.log("✅ Integration store updated with new user ID")
                  } catch (error) {
                    console.error("Error updating integration store user ID:", error)
                  }
                }, 100)
              } else if (event === "SIGNED_OUT") {
                console.log("👋 User signed out")
                set({ user: null, error: null })
                
                // Clear integration store when user signs out
                setTimeout(async () => {
                  try {
                    const { useIntegrationStore } = await import("./integrationStore")
                    const integrationStore = useIntegrationStore.getState()
                    integrationStore.setCurrentUserId(null)
                    integrationStore.clearAllData()
                    console.log("✅ Integration store cleared on auth state change")
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
                  console.log("🔄 Tab became visible, checking auth state...")
                  // Re-check session when tab becomes visible
                  setTimeout(async () => {
                    const { data: { session } } = await supabase.auth.getSession()
                    const currentState = get()
                    
                    if (session?.user && !currentState.user) {
                      console.log("🔄 Restoring session from tab visibility change")
                      // Re-initialize if session exists but user state is missing
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
          console.error("💥 Auth initialization error:", error)
          set({ user: null, error: error.message, loading: false, initialized: true })
        } finally {
          clearTimeout(initTimeout)
        }
      },

      signOut: async () => {
        try {
          set({ loading: true, error: null })

          // Clear local state first
          set({ user: null, profile: null, error: null })

          // Clear integration store immediately
          try {
            const { useIntegrationStore } = await import("./integrationStore")
            const integrationStore = useIntegrationStore.getState()
            integrationStore.setCurrentUserId(null)
            integrationStore.clearAllData()
            console.log("✅ Integration store cleared on logout")
          } catch (error) {
            console.error("Error clearing integration data:", error)
          }
          
          // Sign out from Supabase
          const { error } = await supabase.auth.signOut()
          if (error) {
            console.error("Supabase sign out error:", error)
            // Don't throw here, we've already cleared local state
          }

          set({ loading: false })
          
          // Force a page reload to ensure clean state
          if (typeof window !== 'undefined') {
            window.location.href = '/'
          }
        } catch (error: any) {
          console.error("Sign out error:", error)
          set({ error: error.message, loading: false })
          // Still redirect even if there's an error
          if (typeof window !== 'undefined') {
            window.location.href = '/'
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

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: metadata || {},
            },
          })

          if (error) throw error

          if (data.user) {
            const user: User = {
              id: data.user.id,
              email: data.user.email || "",
              name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
              avatar: data.user.user_metadata?.avatar_url,
            }

            // Create user profile record
            const { error: profileError } = await supabase
              .from('user_profiles')
              .insert({
                id: data.user.id,
                full_name: user.name,
                provider: 'email',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });

            if (profileError) {
              console.error('Error creating user profile:', profileError);
              // Don't throw here as the user creation was successful
            }

            set({ user, loading: false })
          }
        } catch (error: any) {
          console.error("Sign up error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      signInWithGoogle: async () => {
        try {
          set({ loading: true, error: null })

          // Generate a random state parameter for security
          const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
          
          // Store state in sessionStorage for verification
          sessionStorage.setItem('oauth_state', state)

          // Build the Google OAuth URL
          const params = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
            redirect_uri: `${getBaseUrl()}/api/auth/callback`,
            response_type: 'code',
            scope: 'email profile',
            state: state,
            access_type: 'offline',
            prompt: 'consent',
          })

          const googleOAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

          // Redirect to Google OAuth
          window.location.href = googleOAuthUrl

        } catch (error: any) {
          console.error("Google sign in error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      getCurrentUserId: () => {
        return get().user?.id ?? null
      },
    }),
    {
      name: "chainreact-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        console.log("🔄 Auth store rehydrated")
        state?.setHydrated()

        // Only initialize if not already initialized
        if (state && !state.initialized) {
          console.log("🔄 Triggering initialization after rehydration...")
          setTimeout(() => {
            state.initialize()
          }, 100)
        }
      },
    },
  ),
)
