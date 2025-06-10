"use client"

import { create } from "zustand"
import { supabase } from "@/lib/supabase-singleton"
import type { User, Session } from "@supabase/supabase-js"

interface AuthState {
  user: User | null
  session: Session | null
  profile: any | null
  loading: boolean
  error: string | null
  initialized: boolean
}

interface AuthActions {
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, metadata?: any) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: any) => Promise<void>
}

// Global flag to prevent multiple initializations
let isInitializing = false
let hasInitialized = false

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  error: null,
  initialized: false,

  initialize: async () => {
    // Prevent multiple simultaneous initializations
    if (isInitializing || hasInitialized) {
      return
    }

    isInitializing = true

    try {
      if (!supabase) {
        console.warn("Supabase client not available")
        set({
          loading: false,
          initialized: true,
          error: "Authentication service unavailable",
        })
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      set({
        session,
        user: session?.user || null,
        loading: false,
        initialized: true,
      })

      if (session?.user) {
        // Fetch user profile
        try {
          const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", session.user.id).single()
          set({ profile })
        } catch (profileError) {
          console.warn("Could not fetch user profile:", profileError)
          // Continue without profile data
        }
      }

      // Set up auth state listener (only once)
      supabase.auth.onAuthStateChange(async (event, session) => {
        set({
          session,
          user: session?.user || null,
        })

        if (session?.user) {
          try {
            const { data: profile } = await supabase
              .from("user_profiles")
              .select("*")
              .eq("id", session.user.id)
              .single()
            set({ profile })
          } catch (profileError) {
            console.warn("Could not fetch user profile:", profileError)
            set({ profile: null })
          }
        } else {
          set({ profile: null })
        }
      })

      hasInitialized = true
    } catch (error) {
      console.error("Auth initialization error:", error)
      set({
        loading: false,
        initialized: true,
        error: "Failed to initialize authentication",
      })
      hasInitialized = true
    } finally {
      isInitializing = false
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null })

    try {
      if (!supabase) {
        throw new Error("Authentication service unavailable")
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Session will be handled by the auth state change listener
    } catch (error: any) {
      console.error("Sign in error:", error)
      set({ error: error.message || "Failed to sign in" })
    } finally {
      set({ loading: false })
    }
  },

  signUp: async (email: string, password: string, metadata = {}) => {
    set({ loading: true, error: null })

    try {
      if (!supabase) {
        throw new Error("Authentication service unavailable")
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      })

      if (error) throw error

      // Create user profile if user was created
      if (data.user && !data.user.email_confirmed_at) {
        // User needs to confirm email
        set({ error: "Please check your email to confirm your account" })
      } else if (data.user) {
        try {
          const { error: profileError } = await supabase.from("user_profiles").insert({
            id: data.user.id,
            full_name: metadata.full_name || "",
            first_name: metadata.first_name || "",
            last_name: metadata.last_name || "",
          })

          if (profileError) {
            console.error("Profile creation error:", profileError)
          }
        } catch (profileError) {
          console.warn("Could not create user profile:", profileError)
        }
      }
    } catch (error: any) {
      console.error("Sign up error:", error)
      set({ error: error.message || "Failed to sign up" })
    } finally {
      set({ loading: false })
    }
  },

  signInWithGoogle: async () => {
    set({ loading: true, error: null })

    try {
      if (!supabase) {
        throw new Error("Authentication service unavailable")
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (error) throw error
    } catch (error: any) {
      console.error("Google sign in error:", error)
      set({ error: error.message || "Failed to sign in with Google" })
    } finally {
      set({ loading: false })
    }
  },

  signOut: async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut()
      }

      set({
        user: null,
        session: null,
        profile: null,
      })
      window.location.href = "/auth/login"
    } catch (error: any) {
      console.error("Sign out error:", error)
      // Force sign out even if there's an error
      set({
        user: null,
        session: null,
        profile: null,
      })
      window.location.href = "/auth/login"
    }
  },

  updateProfile: async (updates: any) => {
    const { user } = get()

    if (!user || !supabase) return

    try {
      const { error } = await supabase.from("user_profiles").update(updates).eq("id", user.id)

      if (error) throw error

      set((state) => ({
        profile: { ...state.profile, ...updates },
      }))
    } catch (error: any) {
      console.error("Profile update error:", error)
      set({ error: error.message || "Failed to update profile" })
    }
  },
}))
