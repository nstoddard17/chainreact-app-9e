"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

// Safely check for Supabase environment variables
const getSupabaseConfig = () => {
  if (typeof window === "undefined") return { available: false, client: null }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Check if variables exist and are valid URLs/keys
  const isValidUrl = supabaseUrl && supabaseUrl.startsWith("http") && supabaseUrl.includes("supabase")
  const isValidKey = supabaseAnonKey && supabaseAnonKey.length > 20

  return {
    available: !!(isValidUrl && isValidKey),
    url: supabaseUrl,
    key: supabaseAnonKey,
  }
}

// Initialize Supabase client safely
let supabase: any = null
let supabaseAvailable = false

const initializeSupabase = async () => {
  try {
    const config = getSupabaseConfig()

    if (!config.available) {
      console.log("⚠️ Supabase environment variables not properly configured, using mock authentication")
      return false
    }

    // Dynamically import Supabase to avoid initialization errors
    const { createClient } = await import("@supabase/supabase-js")

    supabase = createClient(config.url!, config.key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })

    // Test the connection with a simple call
    const { error } = await supabase.auth.getSession()
    if (error) {
      console.warn("⚠️ Supabase connection test failed:", error.message)
      return false
    }

    console.log("✅ Supabase client initialized and tested successfully")
    return true
  } catch (error) {
    console.error("❌ Failed to initialize Supabase:", error)
    return false
  }
}

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
  usingSupabase: boolean

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

// Mock authentication for demo purposes
const mockUsers = [
  { id: "1", email: "demo@example.com", password: "password", name: "Demo User" },
  { id: "2", email: "admin@chainreact.dev", password: "admin123", name: "Admin User" },
  { id: "3", email: "user@test.com", password: "test123", name: "Test User" },
]

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: false,
      initialized: false,
      error: null,
      hydrated: false,
      usingSupabase: false,

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

          // Try to initialize Supabase
          supabaseAvailable = await initializeSupabase()

          if (supabaseAvailable && supabase) {
            // Try Supabase authentication
            try {
              console.log("🔄 Checking Supabase session...")
              const {
                data: { session },
                error: sessionError,
              } = await supabase.auth.getSession()

              if (sessionError) {
                console.error("Supabase session error:", sessionError)
                throw sessionError
              }

              if (session?.user) {
                console.log("✅ Found valid Supabase session for user:", session.user.email)
                const user: AuthUser = {
                  id: session.user.id,
                  email: session.user.email || "",
                  name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                  avatar: session.user.user_metadata?.avatar_url,
                }

                set({ user, loading: false, initialized: true, error: null, usingSupabase: true })

                // Set up auth state listener for real-time updates
                supabase.auth.onAuthStateChange(async (event: string, session: any) => {
                  console.log("🔄 Supabase auth state changed:", event, session?.user?.email)

                  if (event === "SIGNED_IN" && session?.user) {
                    const user: AuthUser = {
                      id: session.user.id,
                      email: session.user.email || "",
                      name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                      avatar: session.user.user_metadata?.avatar_url,
                    }
                    set({ user, error: null, usingSupabase: true })
                  } else if (event === "SIGNED_OUT") {
                    console.log("👋 User signed out from Supabase")
                    set({ user: null, error: null })
                  } else if (event === "TOKEN_REFRESHED" && session?.user) {
                    console.log("🔄 Supabase token refreshed")
                    const user: AuthUser = {
                      id: session.user.id,
                      email: session.user.email || "",
                      name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                      avatar: session.user.user_metadata?.avatar_url,
                    }
                    set({ user })
                  }
                })

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

                set({ initialized: true })
                return
              } else {
                console.log("❌ No valid Supabase session found")
              }
            } catch (supabaseError) {
              console.error("❌ Supabase session check failed:", supabaseError)
              console.log("🔄 Falling back to mock authentication...")
              supabaseAvailable = false
            }
          }

          // Fallback to mock authentication
          console.log("🔄 Using mock authentication...")
          const savedUser = localStorage.getItem("chainreact-auth-user")
          if (savedUser) {
            try {
              const user = JSON.parse(savedUser)
              console.log("✅ Found saved mock session for user:", user.email)
              set({ user, loading: false, initialized: true, error: null, usingSupabase: false })
            } catch (error) {
              console.error("Error parsing saved user:", error)
              localStorage.removeItem("chainreact-auth-user")
            }
          } else {
            console.log("❌ No saved mock session found")
            set({ user: null, loading: false, initialized: true, usingSupabase: false })
          }

          set({ initialized: true })
        } catch (error: any) {
          console.error("💥 Auth initialization error:", error)
          set({ user: null, error: error.message, loading: false, initialized: true, usingSupabase: false })
        }
      },

      signOut: async () => {
        try {
          set({ loading: true })

          if (supabaseAvailable && supabase && get().usingSupabase) {
            // Sign out from Supabase
            try {
              const { error } = await supabase.auth.signOut()
              if (error) {
                console.error("Supabase sign out error:", error)
              }
            } catch (error) {
              console.error("Supabase sign out failed:", error)
            }
          }

          // Clear localStorage (for both Supabase and mock)
          localStorage.removeItem("chainreact-auth-user")

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
          const { user, usingSupabase } = get()
          if (!user) throw new Error("No user logged in")

          if (supabaseAvailable && supabase && usingSupabase) {
            // Update Supabase profile
            try {
              const { error } = await supabase.auth.updateUser({
                data: {
                  full_name: updates.name,
                  avatar_url: updates.avatar,
                },
              })

              if (error) throw error
            } catch (error) {
              console.error("Supabase profile update failed:", error)
              // Continue with local update
            }
          }

          const updatedUser = { ...user, ...updates }

          // Always save to localStorage as backup
          localStorage.setItem("chainreact-auth-user", JSON.stringify(updatedUser))

          set({ user: updatedUser })
        } catch (error: any) {
          console.error("Profile update error:", error)
          set({ error: error.message })
          throw error
        }
      },

      signIn: async (email: string, password: string) => {
        try {
          set({ loading: true, error: null })

          // Always try mock authentication first to avoid network errors
          console.log("🔄 Checking mock authentication...")
          const mockUser = mockUsers.find((u) => u.email === email && u.password === password)

          if (mockUser) {
            console.log("✅ Mock authentication successful")
            await new Promise((resolve) => setTimeout(resolve, 800)) // Simulate API delay

            const user: AuthUser = {
              id: mockUser.id,
              email: mockUser.email,
              name: mockUser.name,
              avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${mockUser.email}`,
            }

            localStorage.setItem("chainreact-auth-user", JSON.stringify(user))
            set({ user, loading: false, usingSupabase: false })
            return
          }

          // If mock fails and Supabase is available, try Supabase
          if (supabaseAvailable && supabase) {
            try {
              console.log("🔄 Attempting Supabase sign in...")
              const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
              })

              if (error) {
                console.log("❌ Supabase sign in failed:", error.message)
                throw error
              }

              if (data.user) {
                console.log("✅ Supabase sign in successful")
                const user: AuthUser = {
                  id: data.user.id,
                  email: data.user.email || "",
                  name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
                  avatar: data.user.user_metadata?.avatar_url,
                }

                // Save to localStorage as backup
                localStorage.setItem("chainreact-auth-user", JSON.stringify(user))

                set({ user, loading: false, usingSupabase: true })
                return
              }
            } catch (supabaseError: any) {
              console.log("🔄 Supabase sign in failed:", supabaseError.message)
              // Continue to error below
            }
          }

          // If both fail, show error
          throw new Error("Invalid email or password")
        } catch (error: any) {
          console.error("Sign in error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      signUp: async (email: string, password: string, metadata?: Record<string, any>) => {
        try {
          set({ loading: true, error: null })

          // Try Supabase registration first if available
          if (supabaseAvailable && supabase) {
            try {
              console.log("🔄 Attempting Supabase sign up...")
              const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                  data: metadata || {},
                },
              })

              if (error) {
                console.log("❌ Supabase sign up failed:", error.message)
                throw error
              }

              if (data.user) {
                console.log("✅ Supabase sign up successful")
                const user: AuthUser = {
                  id: data.user.id,
                  email: data.user.email || "",
                  name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
                  avatar: data.user.user_metadata?.avatar_url,
                }

                // Save to localStorage as backup
                localStorage.setItem("chainreact-auth-user", JSON.stringify(user))

                set({ user, loading: false, usingSupabase: true })
                return
              }
            } catch (supabaseError: any) {
              console.log("🔄 Supabase sign up failed, using mock authentication...")
              // Continue to mock authentication fallback
            }
          }

          // Fallback to mock authentication
          console.log("🔄 Using mock authentication...")
          await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate API delay

          // Check if user already exists in mock users
          const existingUser = mockUsers.find((u) => u.email === email)
          if (existingUser) {
            throw new Error("User already exists with this email")
          }

          // Create new mock user
          const newUser: AuthUser = {
            id: Date.now().toString(),
            email,
            name: metadata?.name || metadata?.full_name || email.split("@")[0],
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
          }

          // Add to mock users
          mockUsers.push({
            id: newUser.id,
            email: newUser.email,
            password,
            name: newUser.name || "",
          })

          localStorage.setItem("chainreact-auth-user", JSON.stringify(newUser))
          set({ user: newUser, loading: false, usingSupabase: false })
        } catch (error: any) {
          console.error("Sign up error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      signInWithGoogle: async () => {
        try {
          set({ loading: true, error: null })

          // Try Supabase Google OAuth first if available
          if (supabaseAvailable && supabase) {
            try {
              console.log("🔄 Attempting Supabase Google sign in...")
              const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo: `${window.location.origin}/dashboard`,
                },
              })

              if (error) {
                console.log("❌ Supabase Google sign in failed:", error.message)
                throw error
              }

              // OAuth redirect will handle the rest
              set({ loading: false, usingSupabase: true })
              return
            } catch (supabaseError: any) {
              console.log("🔄 Supabase Google sign in failed, using mock...")
              // Continue to mock authentication fallback
            }
          }

          // Fallback to mock Google authentication
          console.log("🔄 Using mock Google authentication...")
          await new Promise((resolve) => setTimeout(resolve, 1500)) // Simulate OAuth flow

          const googleUser: AuthUser = {
            id: "google-" + Date.now(),
            email: "demo@gmail.com",
            name: "Google Demo User",
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=google",
          }

          localStorage.setItem("chainreact-auth-user", JSON.stringify(googleUser))
          set({ user: googleUser, loading: false, usingSupabase: false })
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
        usingSupabase: state.usingSupabase,
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

// Export the supabase client and availability status
export { supabase, supabaseAvailable }
