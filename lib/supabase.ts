import { createBrowserClient } from "@supabase/ssr"
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

let supabase: ReturnType<typeof createBrowserClient<Database>> | null = null

export const getSupabaseClient = () => {
  if (supabase) {
    return supabase
  }

  if (isSupabaseConfigured()) {
    supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    return supabase
  }

  return null
}

export { supabase }
