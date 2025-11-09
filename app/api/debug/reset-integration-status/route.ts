import { NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

/**
 * Debug endpoint to reset an integration's status to allow reconnection
 * Usage: POST /api/debug/reset-integration-status?id=INTEGRATION_ID&secret=SECRET
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const integrationId = searchParams.get("id")
  const secret = searchParams.get("secret")

  // Require authentication
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!integrationId) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 })
  }

  const supabase = getAdminSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
  }

  // Reset the status to 'connected' and clear failure counter
  const { data, error } = await supabase
    .from("integrations")
    .update({
      status: "connected",
      consecutive_failures: 0,
      disconnect_reason: null
    })
    .eq("id", integrationId)
    .select("id, provider, status, consecutive_failures")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: "Integration status reset to 'connected'",
    integration: data
  })
}
