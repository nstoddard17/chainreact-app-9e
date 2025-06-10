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
  clearError: () => void
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

  clearError: () => set({ error: null }),

  initialize: async () => {
    // Prevent multiple simultaneous initializations
    if (isInitializing || hasInitialized) {
      return
    }

    isInitializing = true

    try {
      if (!supabase) {
        console.error("Supabase client not available")
        set({
          loading: false,
          initialized: true,
          error: "Authentication service unavailable",
        })
        return
      }

      // Get initial session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        console.error("Session error:", sessionError)
      }

      set({
        session,
        user: session?.user || null,
        loading: false,
        initialized: true,
        error: null,
      })

      // Fetch user profile if session exists
      if (session?.user) {
        await fetchUserProfile(session.user.id, set)
      }

      // Set up auth state listener
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("Auth state changed:", event, session?.user?.email)

        set({
          session,
          user: session?.user || null,
        })

        if (session?.user) {
          await fetchUserProfile(session.user.id, set)
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

      if (error) {
        console.error("Sign in error:", error)
        throw error
      }

      console.log("Sign in successful:", data.user?.email)
      // Session will be handled by the auth state change listener
    } catch (error: any) {
      console.error("Sign in error:", error)
      set({ error: error.message || "Failed to sign in" })
      throw error
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

      if (error) {
        console.error("Sign up error:", error)
        throw error
      }

      if (data.user && !data.user.email_confirmed_at) {
        set({ error: "Please check your email to confirm your account" })
      } else if (data.user) {
        console.log("Sign up successful:", data.user.email)

        // Try to create profile manually if trigger fails
        try {
          await createUserProfile(data.user, metadata)
        } catch (profileError) {
          console.warn("Manual profile creation failed:", profileError)
          // Don't fail the signup for profile creation issues
        }
      }
    } catch (error: any) {
      console.error("Sign up error:", error)
      set({ error: error.message || "Failed to sign up" })
      throw error
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
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      })

      if (error) {
        console.error("Google sign in error:", error)
        throw error
      }
    } catch (error: any) {
      console.error("Google sign in error:", error)
      set({ error: error.message || "Failed to sign in with Google" })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  signOut: async () => {
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut()
        if (error) {
          console.error("Sign out error:", error)
        }
      }

      set({
        user: null,
        session: null,
        profile: null,
        error: null,
      })

      window.location.href = "/auth/login"
    } catch (error: any) {
      console.error("Sign out error:", error)
      // Force sign out even if there's an error
      set({
        user: null,
        session: null,
        profile: null,
        error: null,
      })
      window.location.href = "/auth/login"
    }
  },

  updateProfile: async (updates: any) => {
    const { user } = get()

    if (!user || !supabase) return

    try {
      const { error } = await supabase.from("user_profiles").update(updates).eq("id", user.id)

      if (error) {
        console.error("Profile update error:", error)
        throw error
      }

      set((state) => ({
        profile: { ...state.profile, ...updates },
      }))
    } catch (error: any) {
      console.error("Profile update error:", error)
      set({ error: error.message || "Failed to update profile" })
    }
  },
}))

// Helper function to fetch user profile
async function fetchUserProfile(userId: string, set: any) {
  if (!supabase) return

  try {
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single()

    if (profileError) {
      if (profileError.code === "PGRST116") {
        // Profile doesn't exist, create it
        console.log("Profile not found, will be created by trigger or manually")
        set({ profile: null })
      } else {
        console.error("Profile fetch error:", profileError)
        set({ profile: null })
      }
    } else {
      set({ profile })
    }
  } catch (error) {
    console.warn("Could not fetch user profile:", error)
    set({ profile: null })
  }
}

// Helper function to create user profile manually
async function createUserProfile(user: User, metadata: any) {
  if (!supabase) return

  try {
    const { error } = await supabase.from("user_profiles").insert({
      id: user.id,
      email: user.email,
      full_name: metadata.full_name || "",
      first_name: metadata.first_name || "",
      last_name: metadata.last_name || "",
      avatar_url: user.user_metadata?.avatar_url || "",
    })

    if (error) {
      console.error("Manual profile creation error:", error)
      throw error
    }

    console.log("Profile created manually for user:", user.email)
  } catch (error) {
    console.error("Failed to create profile manually:", error)
    throw error
  }
}
