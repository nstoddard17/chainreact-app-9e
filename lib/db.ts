// Re-export from db-exports
export { db } from "./db-exports"

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Helper functions for database operations
export async function getIntegration(userId: string, provider: string) {
  const { db } = await import("./db-exports")
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
  const { db } = await import("./db-exports")
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
  const { db } = await import("./db-exports")
  const { data, error } = await db.from("integrations").select("*").eq("user_id", userId)

  if (error) {
    throw error
  }

  return data || []
}
