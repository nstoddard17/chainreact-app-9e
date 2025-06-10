import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { Database } from "@/types/supabase"

// Create a singleton instance of the Supabase client
let supabaseInstance: ReturnType<typeof createClientComponentClient<Database>> | null = null

// Mock client for development when Supabase is not configured
const createMockClient = () => {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: (callback: any) => {
        // Return a mock unsubscribe function
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signInWithPassword: async () => ({ data: { session: null, user: null }, error: null }),
      signInWithOAuth: async () => ({ data: {}, error: null }),
      signUp: async () => ({ data: { session: null, user: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          execute: async () => ({ data: [], error: null }),
        }),
        execute: async () => ({ data: [], error: null }),
      }),
      insert: () => ({
        execute: async () => ({ data: null, error: null }),
      }),
      update: () => ({
        eq: () => ({
          execute: async () => ({ data: null, error: null }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          execute: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  } as unknown as ReturnType<typeof createClientComponentClient<Database>>
}

// Get or create the Supabase client
const getSupabaseClient = () => {
  // For SSR, return null
  if (typeof window === "undefined") {
    return null
  }

  // Return existing instance if available
  if (supabaseInstance) {
    return supabaseInstance
  }

  // Check if Supabase is properly configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase environment variables not found. Using mock client.")
    supabaseInstance = createMockClient()
    return supabaseInstance
  }

  try {
    supabaseInstance = createClientComponentClient<Database>()
    return supabaseInstance
  } catch (error) {
    console.error("Failed to create Supabase client:", error)
    supabaseInstance = createMockClient()
    return supabaseInstance
  }
}

// Export the singleton instance
export const supabase = getSupabaseClient()
