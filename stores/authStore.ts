"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
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
                  return
                } else {
                  console.log("❌ No session found after setting tokens");
                }
              } else {
                console.log("❌ Missing tokens in hash");
              }
            }
          }

          // Get current session from Supabase
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession()

          if (sessionError) {
            console.error("Session error:", sessionError)
            set({ user: null, error: sessionError.message, loading: false, initialized: true })
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

            // Fetch additional profile data from user_profiles table
            const { data: profileData } = await supabase
              .from('user_profiles')
              .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, created_at, updated_at')
              .eq('id', session.user.id)
              .single()

            if (profileData) {
              user.first_name = profileData.first_name
              user.last_name = profileData.last_name
              user.full_name = profileData.full_name || user.name
            }

            const profile: Profile = profileData || {
              id: session.user.id,
              full_name: user.name,
              avatar_url: user.avatar
            }

            set({ user, profile, loading: false, initialized: true })

            // Set current user ID in integration store
            setTimeout(async () => {
              try {
                const { useIntegrationStore } = await import("./integrationStore")
                useIntegrationStore.getState().setCurrentUserId(session.user.id)
                console.log("✅ Integration store updated with existing user ID")
              } catch (error) {
                console.error("Error updating integration store user ID on init:", error)
              }
            }, 100)

            // Start background data preloading (only once)
            console.log("🚀 Starting background data preload...")
            setTimeout(async () => {
              try {
                const { useIntegrationStore } = await import("./integrationStore")
                const integrationStore = useIntegrationStore.getState()

                // Only start if not already started
                if (!integrationStore.preloadStarted && !integrationStore.globalPreloadingData) {
                  await integrationStore.fetchIntegrations(true)
                  await integrationStore.initializeGlobalPreload()
                  console.log("✅ Background preload completed")
                }
              } catch (error) {
                console.error("❌ Background preload failed:", error)
              }
            }, 1000)
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
            }, 100)
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
                const { data: profileData } = await supabase
                  .from('user_profiles')
                  .select('id, first_name, last_name, full_name, company, job_title, username, secondary_email, phone_number, avatar_url, created_at, updated_at')
                  .eq('id', session.user.id)
                  .single()

                if (profileData) {
                  user.first_name = profileData.first_name
                  user.last_name = profileData.last_name
                  user.full_name = profileData.full_name || user.name
                }

                const profile: Profile = profileData || {
                  id: session.user.id,
                  full_name: user.name,
                  avatar_url: user.avatar
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
          }
        } catch (error: any) {
          console.error("💥 Auth initialization error:", error)
          set({ user: null, error: error.message, loading: false, initialized: true })
        }
      },

      signOut: async () => {
        try {
          set({ loading: true })
          const { error } = await supabase.auth.signOut()
          if (error) throw error

          set({ user: null, loading: false, error: null })

          // Clear integration store properly
          setTimeout(async () => {
            try {
              const { useIntegrationStore } = await import("./integrationStore")
              const integrationStore = useIntegrationStore.getState()
              
              // Set current user to null first, then clear all data
              integrationStore.setCurrentUserId(null)
              integrationStore.clearAllData()
              
              console.log("✅ Integration store cleared on logout")
            } catch (error) {
              console.error("Error clearing integration data:", error)
            }
          }, 100)
        } catch (error: any) {
          console.error("Sign out error:", error)
          set({ error: error.message, loading: false })
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
            redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`,
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
