import { createClient } from "@supabase/supabase-js"

import { logger } from '@/lib/utils/logger'
import type { Database } from "../types/database.types"

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing required Supabase environment variables")
}

// Export the db client as a named export with proper typing
export const db = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Helper functions for database operations
export async function getIntegration(userId: string, provider: string) {
  try {
    const { data, error } = await db
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single()

    if (error && error.code !== "PGRST116") {
      throw error
    }

    return data
  } catch (error) {
    logger.error("Error getting integration:", error)
    return null
  }
}

export async function upsertIntegration(integration: any) {
  try {
    const { data, error } = await db
      .from("integrations")
      .upsert(integration, {
        onConflict: "user_id,provider",
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return data
  } catch (error) {
    logger.error("Error upserting integration:", error)
    throw error
  }
}

export async function getUserIntegrations(userId: string) {
  try {
    const { data, error } = await db.from("integrations").select("*").eq("user_id", userId)

    if (error) {
      throw error
    }

    return data || []
  } catch (error) {
    logger.error("Error getting user integrations:", error)
    return []
  }
}
