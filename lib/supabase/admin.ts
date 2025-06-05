import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

// Server-only admin client - DO NOT import this in client-side code
let adminClient: ReturnType<typeof createClient<Database>> | null = null

export function createAdminSupabaseClient() {
  // Ensure this only runs on the server
  if (typeof window !== "undefined") {
    throw new Error("Admin Supabase client cannot be used on the client side")
  }

  // Return existing client if already created
  if (adminClient) {
    return adminClient
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    const missingVars = {
      SUPABASE_URL: !supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: !supabaseServiceKey,
    }

    console.error("Missing Supabase admin environment variables:", missingVars)
    console.error("Please ensure these variables are set in your .env.local file:")
    if (!supabaseUrl) console.error("- SUPABASE_URL")
    if (!supabaseServiceKey) console.error("- SUPABASE_SERVICE_ROLE_KEY")

    throw new Error("Supabase admin environment variables are required for server operations")
  }

  try {
    adminClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    console.log("✅ Supabase admin client initialized successfully")
    return adminClient
  } catch (error) {
    console.error("❌ Failed to create Supabase admin client:", error)
    throw error
  }
}

// Helper function to get admin client safely
export function getAdminSupabaseClient() {
  if (typeof window !== "undefined") {
    throw new Error("Admin Supabase client cannot be used on the client side")
  }

  return createAdminSupabaseClient()
}
