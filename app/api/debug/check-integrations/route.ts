import { NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

/**
 * Debug endpoint to check integration statuses
 * Usage: GET /api/debug/check-integrations?provider=gmail
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get("provider")

  const supabase = getAdminSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
  }

  let query = supabase
    .from("integrations")
    .select("id, provider, status, created_at, updated_at, expires_at, consecutive_failures, disconnect_reason, user_id")
    .order("created_at", { ascending: false })

  if (provider) {
    query = query.eq("provider", provider)
  }

  const { data: integrations, error } = await query.limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    count: integrations?.length || 0,
    integrations: integrations?.map(i => ({
      id: i.id,
      provider: i.provider,
      status: i.status,
      created_at: i.created_at,
      updated_at: i.updated_at,
      expires_at: i.expires_at,
      consecutive_failures: i.consecutive_failures,
      disconnect_reason: i.disconnect_reason,
      user_id: i.user_id?.substring(0, 8) + "..." // Partial user ID for privacy
    }))
  })
}
