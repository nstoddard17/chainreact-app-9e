import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

// Singleton pattern to ensure only one Supabase client instance
let supabaseClient: ReturnType<typeof createClientComponentClient> | null = null

export const getSupabaseClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClientComponentClient()
  }
  return supabaseClient
}

export const supabase = getSupabaseClient()

// Add the missing createClient export
export const createClient = createClientComponentClient
