import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

// Server-only admin client - DO NOT import this in client-side code
export const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase URL or service role key for admin client")
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Helper function to get an admin supabase client
export const getAdminSupabaseClient = () => createAdminClient()
