import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Create the database client
const dbClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Export as named export
export const db = dbClient

// Helper functions for database operations
export async function getIntegration(userId: string, provider: string) {
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
}

export async function upsertIntegration(integration: any) {
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
}

export async function getUserIntegrations(userId: string) {
  const { data, error } = await db.from("integrations").select("*").eq("user_id", userId)

  if (error) {
    throw error
  }

  return data || []
}
