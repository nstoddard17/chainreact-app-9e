"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { supabase } from "@/utils/supabaseClient"

interface User {
  id: string
  email: string
  name?: string
  avatar?: string
}

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  error: string | null
  hydrated: boolean
  initialize: () => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<User>) => Promise<void>
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

            set({ user, loading: false, initialized: true })

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

                set({ user, error: null })
                
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

      updateProfile: async (updates: Partial<User>) => {
        try {
          const { user } = get()
          if (!user) throw new Error("No user logged in")

          const { error } = await supabase.auth.updateUser({
            data: {
              full_name: updates.name,
              avatar_url: updates.avatar,
            },
          })

          if (error) throw error

          set({
            user: {
              ...user,
              ...updates,
            },
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

          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${window.location.origin}/dashboard`,
            },
          })

          if (error) throw error

          set({ loading: false })
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
