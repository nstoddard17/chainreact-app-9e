import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { Database } from "@/types/supabase"

// Check if Supabase is configured with exact environment variables
export const isSupabaseConfigured = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const missingVars = []
    if (!supabaseUrl) missingVars.push("NEXT_PUBLIC_SUPABASE_URL")
    if (!supabaseAnonKey) missingVars.push("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    const errorMessage = `Missing required Supabase environment variables: ${missingVars.join(", ")}`

    if (process.env.NODE_ENV === "development") {
      throw new Error(errorMessage)
    } else {
      console.error(errorMessage)
    }

    return false
  }

  return true
}

// Browser client for client-side operations with persistence
export const createBrowserSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const missingVars = []
    if (!supabaseUrl) missingVars.push("NEXT_PUBLIC_SUPABASE_URL")
    if (!supabaseAnonKey) missingVars.push("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    const errorMessage = `Missing required Supabase environment variables: ${missingVars.join(", ")}`

    if (process.env.NODE_ENV === "development") {
      throw new Error(errorMessage)
    } else {
      console.error(errorMessage)
      return null
    }
  }

  return createClientComponentClient<Database>({
    options: {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    },
  })
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

// For compatibility with existing code - only use on client side
const supabaseClient = typeof window !== "undefined" ? getSupabaseClient() : null

// Single named export to avoid conflicts
export const supabase = supabaseClient

// Required exports for deployment
export const createClient = () => getSupabaseClient()

// Default export for compatibility
export default supabaseClient
