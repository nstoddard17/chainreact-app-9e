import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { Database } from "@/types/supabase"

// Check if Supabase is configured
export const isSupabaseConfigured = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase environment variables missing:", {
      url: !!supabaseUrl,
      key: !!supabaseAnonKey,
    })
    return false
  }

  return true
}

// Browser client for client-side operations
export const createBrowserSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase environment variables:", {
      NEXT_PUBLIC_SUPABASE_URL: !!supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!supabaseAnonKey,
    })
    throw new Error("Supabase environment variables are required")
  }

  return createClientComponentClient<Database>()
}

// Global singleton for browser usage
declare global {
  var __supabase_browser_client__: ReturnType<typeof createClientComponentClient<Database>> | undefined
}

export const getSupabaseClient = () => {
  // This function only works on the client side
  if (typeof window === "undefined") {
    console.warn("getSupabaseClient called on server side, returning null")
    return null
  }

  // Browser-side: use global singleton
  if (!globalThis.__supabase_browser_client__) {
    try {
      globalThis.__supabase_browser_client__ = createBrowserSupabaseClient()
    } catch (error) {
      console.error("Failed to create browser Supabase client:", error)
      return null
    }
  }
  return globalThis.__supabase_browser_client__
}

// For compatibility with existing code
export const supabase = getSupabaseClient()
export const createClient = () => getSupabaseClient()
