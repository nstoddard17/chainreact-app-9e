"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { supabase } from "@/lib/supabase"
import { useIntegrationStore } from "./integrationStore"

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
  initialize: () => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<User>) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, metadata?: Record<string, any>) => Promise<void>
  signInWithGoogle: () => Promise<void>
  getCurrentUserId: () => string | null
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: false, // Start with false since we'll check persistence first
      initialized: false,
      error: null,

      initialize: async () => {
        try {
          set({ loading: true, error: null })

          // Get initial session - this will restore from localStorage if available
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession()

          if (sessionError) {
            console.error("Session error:", sessionError)
            set({ error: sessionError.message, loading: false, initialized: true })
            return
          }

          if (session?.user) {
            const user: User = {
              id: session.user.id,
              email: session.user.email || "",
              name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
              avatar: session.user.user_metadata?.avatar_url,
            }

            set({ user, loading: false, initialized: true })

            // Start background data preloading immediately without waiting
            console.log("User authenticated, starting background data preload...")
            const integrationStore = useIntegrationStore.getState()
            integrationStore.initializeGlobalPreload().catch((error) => {
              console.error("Background preload failed:", error)
            })
          } else {
            set({ user: null, loading: false, initialized: true })
          }

          // Listen for auth changes
          supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Auth state changed:", event)

            if (event === "SIGNED_IN" && session?.user) {
              const user: User = {
                id: session.user.id,
                email: session.user.email || "",
                name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                avatar: session.user.user_metadata?.avatar_url,
              }

              set({ user, error: null })

              // Start background data preloading on sign in
              console.log("User signed in, starting background data preload...")
              const integrationStore = useIntegrationStore.getState()
              integrationStore.initializeGlobalPreload().catch((error) => {
                console.error("Background preload failed:", error)
              })
            } else if (event === "SIGNED_OUT") {
              set({ user: null, error: null })

              // Clear integration data on sign out
              useIntegrationStore.setState({
                integrations: [],
                dynamicData: {},
                preloadProgress: {},
                preloadStarted: false,
                globalPreloadingData: false,
              })
            } else if (event === "TOKEN_REFRESHED") {
              console.log("Token refreshed successfully")
            }
          })
        } catch (error: any) {
          console.error("Auth initialization error:", error)
          set({ error: error.message, loading: false, initialized: true })
        }
      },

      signOut: async () => {
        try {
          set({ loading: true })
          const { error } = await supabase.auth.signOut()
          if (error) throw error

          // Clear all stores
          set({ user: null, loading: false, error: null })

          // Clear integration store
          useIntegrationStore.setState({
            integrations: [],
            dynamicData: {},
            preloadProgress: {},
            preloadStarted: false,
            globalPreloadingData: false,
          })
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

            // Start background data preloading
            console.log("User signed in, starting background data preload...")
            const integrationStore = useIntegrationStore.getState()
            integrationStore.initializeGlobalPreload().catch((error) => {
              console.error("Background preload failed:", error)
            })
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

          // Note: The actual user state will be set by the onAuthStateChange listener
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
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        initialized: state.initialized,
      }),
    },
  ),
)
