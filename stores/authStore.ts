"use client"

import { create } from "zustand"
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  error: null,

  initialize: async () => {
    try {
      set({ loading: true, error: null })

      // Get initial session
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

        // Start global data preloading - but use a small delay to ensure stores are ready
        setTimeout(() => {
          console.log("User authenticated, starting global data preload...")
          try {
            const integrationStore = useIntegrationStore.getState()
            integrationStore.ensureDataPreloaded()
          } catch (preloadError) {
            console.error("Error starting global preload:", preloadError)
          }
        }, 100)
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

          // Start global data preloading on sign in
          console.log("User signed in, starting global data preload...")
          try {
            const integrationStore = useIntegrationStore.getState()
            integrationStore.initializeGlobalPreload()
          } catch (preloadError) {
            console.error("Error starting global preload:", preloadError)
          }
        } else if (event === "SIGNED_OUT") {
          set({ user: null, error: null })

          // Clear integration data on sign out properly
          const integrationStore = useIntegrationStore.getState()
          if (integrationStore.clearAllData) {
            integrationStore.clearAllData()
          } else {
            useIntegrationStore.setState({
              integrations: [],
              dynamicData: {},
              preloadProgress: {},
              preloadStarted: false,
              globalPreloadingData: false,
            })
          }
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

      // Clear integration store properly
      const integrationStore = useIntegrationStore.getState()
      if (integrationStore.clearAllData) {
        integrationStore.clearAllData()
      } else {
        useIntegrationStore.setState({
          integrations: [],
          dynamicData: {},
          preloadProgress: {},
          preloadStarted: false,
          globalPreloadingData: false,
        })
      }
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

        // Start global data preloading
        console.log("User signed in, starting global data preload...")
        try {
          const integrationStore = useIntegrationStore.getState()
          integrationStore.initializeGlobalPreload()
        } catch (preloadError) {
          console.error("Error starting global preload:", preloadError)
        }
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
}))
