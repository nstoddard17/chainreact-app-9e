import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { Database } from "@/types/supabase"

// Server client for route handlers - only use this in API routes
export const createServerSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const missingVars = []
    if (!supabaseUrl) missingVars.push("NEXT_PUBLIC_SUPABASE_URL")
    if (!supabaseAnonKey) missingVars.push("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    const errorMessage = `Missing required server-side Supabase environment variables: ${missingVars.join(", ")}`
    console.warn(errorMessage)

    // Return a mock client that will fail gracefully
    return null
  }

  return createRouteHandlerClient<Database>({ cookies })
}

// Add the missing createClient export for compatibility
export const createClient = createServerSupabaseClient
