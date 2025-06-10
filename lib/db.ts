import { createClient } from "@supabase/supabase-js"

// Use the same environment variables as the client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("Missing Supabase environment variables for server client")
}

// Export the db client as a named export
export const db =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null

// Helper functions for database operations
export async function getIntegration(userId: string, provider: string) {
  if (!db) {
    console.warn("Database client not available")
    return null
  }

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
    console.error("Error getting integration:", error)
    return null
  }
}

export async function upsertIntegration(integration: any) {
  if (!db) {
    throw new Error("Database client not available")
  }

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
    console.error("Error upserting integration:", error)
    throw error
  }
}

export async function getUserIntegrations(userId: string) {
  if (!db) {
    console.warn("Database client not available")
    return []
  }

  try {
    const { data, error } = await db.from("integrations").select("*").eq("user_id", userId)

    if (error) {
      throw error
    }

    return data || []
  } catch (error) {
    console.error("Error getting user integrations:", error)
    return []
  }
}
