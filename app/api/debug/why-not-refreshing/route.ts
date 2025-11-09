import { NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

/**
 * Debug endpoint to explain why an integration isn't being refreshed
 * Usage: GET /api/debug/why-not-refreshing?provider=gmail
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get("provider")

  if (!provider) {
    return NextResponse.json({ error: "provider query param required" }, { status: 400 })
  }

  const supabase = getAdminSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
  }

  // Get the integration
  const { data: integrations, error } = await supabase
    .from("integrations")
    .select("id, provider, status, expires_at, refresh_token, consecutive_failures, disconnect_reason, created_at, updated_at")
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(5)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!integrations || integrations.length === 0) {
    return NextResponse.json({
      provider,
      found: false,
      message: `No ${provider} integrations found for any user`
    })
  }

  const now = new Date()
  const expiryThreshold = new Date(now.getTime() + 30 * 60 * 1000) // 30 minutes

  const diagnoses = integrations.map(integration => {
    const reasons = []
    let willBeRefreshed = true

    // Check 1: Has refresh token?
    if (!integration.refresh_token) {
      reasons.push("❌ No refresh_token stored")
      willBeRefreshed = false
    } else {
      reasons.push("✅ Has refresh_token")
    }

    // Check 2: Status check
    if (integration.status === 'needs_reauthorization') {
      reasons.push("❌ Status is 'needs_reauthorization' (cron job skips these)")
      willBeRefreshed = false
    } else {
      reasons.push(`✅ Status is '${integration.status}' (not 'needs_reauthorization')`)
    }

    // Check 3: Expiration check
    if (!integration.expires_at) {
      reasons.push("⚠️ No expires_at set (cron job will try to refresh)")
    } else {
      const expiresAt = new Date(integration.expires_at)
      const isExpired = expiresAt <= now
      const isExpiringSoon = expiresAt <= expiryThreshold
      const minutesUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60))

      if (isExpired) {
        reasons.push(`⚠️ Token ALREADY EXPIRED ${Math.abs(minutesUntilExpiry)} minutes ago`)
      } else if (isExpiringSoon) {
        reasons.push(`✅ Token expires in ${minutesUntilExpiry} minutes (within 30-minute threshold)`)
      } else {
        reasons.push(`❌ Token expires in ${minutesUntilExpiry} minutes (not within 30-minute threshold)`)
        willBeRefreshed = false
      }
    }

    // Check 4: Consecutive failures
    if (integration.consecutive_failures > 0) {
      reasons.push(`⚠️ Has ${integration.consecutive_failures} consecutive refresh failures`)
    }

    return {
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      expires_at: integration.expires_at,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
      consecutive_failures: integration.consecutive_failures,
      disconnect_reason: integration.disconnect_reason,
      willBeRefreshed,
      reasons
    }
  })

  return NextResponse.json({
    provider,
    found: true,
    count: integrations.length,
    currentTime: now.toISOString(),
    expiryThreshold: expiryThreshold.toISOString(),
    thresholdMinutes: 30,
    diagnoses
  })
}
