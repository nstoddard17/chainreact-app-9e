import { createClient as createBrowserClient } from "@/utils/supabase/client"

export function createClient() {
  return createBrowserClient()
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
