import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server-side database client with service role key
export const db = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Helper functions for common database operations
export const dbHelpers = {
  // Get user integrations
  async getUserIntegrations(userId: string) {
    const { data, error } = await db.from("integrations").select("*").eq("user_id", userId)

    if (error) throw error
    return data
  },

  // Save integration
  async saveIntegration(integration: {
    user_id: string
    provider: string
    access_token: string
    refresh_token?: string
    expires_at?: string
    scope?: string
    metadata?: any
  }) {
    const { data, error } = await db
      .from("integrations")
      .upsert(integration, {
        onConflict: "user_id,provider",
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Delete integration
  async deleteIntegration(userId: string, provider: string) {
    const { error } = await db.from("integrations").delete().eq("user_id", userId).eq("provider", provider)

    if (error) throw error
  },

  // Get workflows
  async getUserWorkflows(userId: string) {
    const { data, error } = await db
      .from("workflows")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return data
  },

  // Save workflow
  async saveWorkflow(workflow: {
    id?: string
    user_id: string
    name: string
    description?: string
    nodes: any
    edges: any
    is_active?: boolean
    metadata?: any
  }) {
    const { data, error } = await db.from("workflows").upsert(workflow).select().single()

    if (error) throw error
    return data
  },
}
