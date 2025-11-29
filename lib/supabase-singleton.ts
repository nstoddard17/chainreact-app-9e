import { createBrowserClient } from "@supabase/ssr"

import { logger } from '@/lib/utils/logger'
import type { Database } from "@/types/supabase"

let globalSupabaseClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getSupabaseClient() {
  if (globalSupabaseClient) return globalSupabaseClient

  try {
    if (typeof window !== "undefined") {
      globalSupabaseClient = createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    } else {
      return createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    }
  } catch (error) {
    logger.error("Failed to create Supabase client:", error)
    return null
  }

  return globalSupabaseClient
}

export const supabase = getSupabaseClient()
