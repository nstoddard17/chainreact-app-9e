import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/types/supabase"

// Create a singleton Supabase client for client-side usage
let supabaseClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  if (!supabaseClient) {
    supabaseClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )
  }
  return supabaseClient
}

// Lazily get the client instance - avoid module-level initialization for build compatibility
export function getSupabase() {
  return createClient()
}

// Backward-compatible export using a Proxy to lazily initialize
// This prevents module-level client creation while maintaining import { supabase } usage
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop) {
    return (createClient() as any)[prop]
  }
})

// Re-export for compatibility
export default createClient
