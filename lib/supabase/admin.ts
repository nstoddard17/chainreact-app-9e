import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

// Server-only admin client - DO NOT import this in client-side code
let adminClient: ReturnType<typeof createClient<Database>> | null = null

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const createAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase URL or service role key for admin client")
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// This is a singleton instance for server-side use where needed
const adminDb = createAdminClient()
export default adminDb

// Helper function to get admin client safely
export const getAdminSupabaseClient = () => {
  if (!adminDb) {
    throw new Error("Admin client not initialized")
  }
  return adminDb
}
