"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { supabase } from "@/lib/supabase"

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
        if (state.initialized) {
          console.log("Auth already initialized")
          return
        }

        try {
          set({ loading: true, error: null })
          console.log("🔄 Starting auth initialization...")

          // Get initial session with retry logic
          let session = null
          let sessionError = null

          for (let i = 0; i < 3; i++) {
            const result = await supabase.auth.getSession()
            session = result.data.session
            sessionError = result.error

            if (!sessionError && session) break
            if (i < 2) await new Promise((resolve) => setTimeout(resolve, 1000))
          }

          if (sessionError) {
            console.error("Session error:", sessionError)
            set({ error: sessionError.message, loading: false, initialized: true })
            return
          }

          if (session?.user) {
            console.log("✅ Found existing session for user:", session.user.email)
            const user: User = {
              id: session.user.id,
              email: session.user.email || "",
              name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
              avatar: session.user.user_metadata?.avatar_url,
            }

            set({ user, loading: false, initialized: true })

            // Start background data preloading with proper timing
            console.log("🚀 User authenticated, starting background data preload...")
            setTimeout(async () => {
              try {
                const { useIntegrationStore } = await import("./integrationStore")
                const integrationStore = useIntegrationStore.getState()

                // Ensure integration store is hydrated first
                let attempts = 0
                while (!integrationStore.hydrated && attempts < 10) {
                  await new Promise((resolve) => setTimeout(resolve, 500))
                  attempts++
                }

                // First fetch integrations, then preload data
                await integrationStore.fetchIntegrations(true)
                await integrationStore.initializeGlobalPreload()
                console.log("✅ Background preload completed")
              } catch (error) {
                console.error("❌ Background preload failed:", error)
              }
            }, 1500)
          } else {
            console.log("❌ No existing session found")
            set({ user: null, loading: false, initialized: true })
          }

          // Listen for auth changes
          supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("🔄 Auth state changed:", event, session?.user?.email)

            if (event === "SIGNED_IN" && session?.user) {
              const user: User = {
                id: session.user.id,
                email: session.user.email || "",
                name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                avatar: session.user.user_metadata?.avatar_url,
              }

              set({ user, error: null })

              // Start background data preloading on sign in
              console.log("🚀 User signed in, starting background data preload...")
              setTimeout(async () => {
                try {
                  const { useIntegrationStore } = await import("./integrationStore")
                  const integrationStore = useIntegrationStore.getState()

                  // Wait for integration store hydration
                  let attempts = 0
                  while (!integrationStore.hydrated && attempts < 10) {
                    await new Promise((resolve) => setTimeout(resolve, 500))
                    attempts++
                  }

                  // First fetch integrations, then preload data
                  await integrationStore.fetchIntegrations(true)
                  await integrationStore.initializeGlobalPreload()
                  console.log("✅ Background preload completed")
                } catch (error) {
                  console.error("❌ Background preload failed:", error)
                }
              }, 1500)
            } else if (event === "SIGNED_OUT") {
              console.log("👋 User signed out")
              set({ user: null, error: null })

              // Clear integration data on sign out
              setTimeout(async () => {
                try {
                  const { useIntegrationStore } = await import("./integrationStore")
                  useIntegrationStore.getState().clearAllData()
                } catch (error) {
                  console.error("Error clearing integration data:", error)
                }
              }, 100)
            } else if (event === "TOKEN_REFRESHED") {
              console.log("🔄 Token refreshed successfully")
            }
          })
        } catch (error: any) {
          console.error("💥 Auth initialization error:", error)
          set({ error: error.message, loading: false, initialized: true })
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
        initialized: state.initialized,
      }),
      onRehydrateStorage: () => (state) => {
        console.log("🔄 Auth store rehydrated:", state?.user?.email || "no user")
        state?.setHydrated()

        // Trigger initialization after hydration if not already initialized
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
