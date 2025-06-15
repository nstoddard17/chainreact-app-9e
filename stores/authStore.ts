"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { createClient } from "@supabase/supabase-js"

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

interface AuthUser {
  id: string
  email: string
  name?: string
  avatar?: string
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  initialized: boolean
  error: string | null
  hydrated: boolean

  // Actions
  initialize: () => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<AuthUser>) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, metadata?: Record<string, any>) => Promise<void>
  signInWithGoogle: () => Promise<void>
  getCurrentUserId: () => string | null
  setHydrated: () => void
  clearError: () => void
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

      clearError: () => {
        set({ error: null })
      },

      initialize: async () => {
        const state = get()
        if (state.initialized) {
          console.log("Auth already initialized")
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
            console.log("✅ Found valid session for user:", session.user.email)
            const user: AuthUser = {
              id: session.user.id,
              email: session.user.email || "",
              name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
              avatar: session.user.user_metadata?.avatar_url,
            }

            set({ user, loading: false, initialized: true, error: null })

            // Start background data preloading
            console.log("🚀 Starting background data preload...")
            setTimeout(async () => {
              try {
                const { useIntegrationStore } = await import("./integrationStore")
                const integrationStore = useIntegrationStore.getState()

                // Wait for integration store to be ready
                let attempts = 0
                while (!integrationStore.hydrated && attempts < 20) {
                  await new Promise((resolve) => setTimeout(resolve, 250))
                  attempts++
                }

                if (integrationStore.hydrated) {
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
          }

          // Set up auth state listener for real-time updates
          supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("🔄 Auth state changed:", event, session?.user?.email)

            if (event === "SIGNED_IN" && session?.user) {
              const user: AuthUser = {
                id: session.user.id,
                email: session.user.email || "",
                name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                avatar: session.user.user_metadata?.avatar_url,
              }
              set({ user, error: null })
            } else if (event === "SIGNED_OUT") {
              console.log("👋 User signed out")
              set({ user: null, error: null })
            } else if (event === "TOKEN_REFRESHED" && session?.user) {
              console.log("🔄 Token refreshed")
              const user: AuthUser = {
                id: session.user.id,
                email: session.user.email || "",
                name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                avatar: session.user.user_metadata?.avatar_url,
              }
              set({ user })
            }
          })

          set({ initialized: true })
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

          // Clear integration store
          setTimeout(async () => {
            try {
              const { useIntegrationStore } = await import("./integrationStore")
              useIntegrationStore.getState().clearAllData()
            } catch (error) {
              console.error("Error clearing integration data:", error)
            }
          }, 100)
        } catch (error: any) {
          console.error("Sign out error:", error)
          set({ error: error.message, loading: false })
        }
      },

      updateProfile: async (updates: Partial<AuthUser>) => {
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
            const user: AuthUser = {
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
            const user: AuthUser = {
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
        console.log("🔄 Auth store rehydrated:", state?.user?.email || "no user")
        state?.setHydrated()

        if (state) {
          console.log("🔄 Triggering initialization after rehydration...")
          setTimeout(() => {
            state.initialize()
          }, 100)
        }
      },
    },
  ),
)

// Export the supabase client for use in other parts of the app
export { supabase }
