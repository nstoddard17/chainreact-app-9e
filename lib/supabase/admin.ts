import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

// Server-only admin client - DO NOT import this in client-side code
let adminClient: ReturnType<typeof createClient<Database>> | null = null

export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Missing Supabase URL or service role key for admin client")
    return null
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

// Helper function to get admin client safely
export function getAdminSupabaseClient() {
  if (typeof window !== "undefined") {
    throw new Error("Admin Supabase client cannot be used on the client side")
  }

  return createAdminSupabaseClient()
}
