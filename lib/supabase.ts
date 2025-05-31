import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { Database } from "@/types/supabase"

// Check if Supabase is configured
export const isSupabaseConfigured = () => {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

// Global singleton to ensure only one instance across the entire app
declare global {
  var __supabase_client__: ReturnType<typeof createClientComponentClient<Database>> | undefined
}

export const getSupabaseClient = () => {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured. Some features may not work.")
    return null
  }

  if (typeof window === "undefined") {
    // Server-side: always create a new instance
    try {
      return createClientComponentClient<Database>()
    } catch (error) {
      console.error("Failed to create server Supabase client:", error)
      return null
    }
  }

  // Client-side: use global singleton
  if (!globalThis.__supabase_client__) {
    try {
      globalThis.__supabase_client__ = createClientComponentClient<Database>()
    } catch (error) {
      console.error("Failed to create client Supabase client:", error)
      return null
    }
  }

  return globalThis.__supabase_client__
}

// Export the singleton instance (can be null if not configured)
export const supabase = getSupabaseClient()

// For compatibility with existing code
export const createClient = () => getSupabaseClient()
