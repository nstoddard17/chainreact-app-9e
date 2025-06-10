import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { Database } from "@/types/supabase"

// Server client for route handlers - only use this in API routes
export const createServerSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const missingVars = []
    if (!supabaseUrl) missingVars.push("SUPABASE_URL")
    if (!supabaseAnonKey) missingVars.push("SUPABASE_ANON_KEY")

    const errorMessage = `Missing required server-side Supabase environment variables: ${missingVars.join(", ")}`

    if (process.env.NODE_ENV === "development") {
      throw new Error(errorMessage)
    } else {
      console.error(errorMessage)
      throw new Error("Server configuration error")
    }
  }

  return createRouteHandlerClient<Database>({ cookies })
}

// Add the missing createClient export for compatibility
export const createClient = createServerSupabaseClient
