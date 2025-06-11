import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { Database } from "@/types/supabase"

export async function GET() {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Session error:", sessionError)
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const userId = session.user.id

    // Get all integrations for the user
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    // Process each integration to extract key information
    const results = integrations.map((integration) => {
      const { provider, id, status, access_token, refresh_token, expires_at, metadata, scopes, granted_scopes } =
        integration

      // Check token storage
      const hasAccessToken = !!access_token || !!metadata?.access_token
      const hasRefreshToken = !!refresh_token || !!metadata?.refresh_token

      // Check token expiration
      const tokenExpiresAt = expires_at || metadata?.expires_at
      let expiryStatus = "Unknown"

      if (tokenExpiresAt) {
        const expiryDate = new Date(tokenExpiresAt * 1000)
        const now = new Date()
        expiryStatus = expiryDate < now ? "Expired" : `Valid until ${expiryDate.toISOString()}`
      }

      // Check scopes
      const storedScopes = scopes || granted_scopes || metadata?.scopes || []

      return {
        provider,
        id,
        status,
        tokenStatus: {
          hasAccessToken,
          hasRefreshToken,
          expiryStatus,
        },
        scopes: storedScopes,
        metadata: {
          hasMetadata: !!metadata,
          tokenInMetadata: !!metadata?.access_token,
          refreshTokenInMetadata: !!metadata?.refresh_token,
          scopesInMetadata: !!metadata?.scopes,
        },
      }
    })

    return NextResponse.json({
      userId,
      integrationCount: integrations.length,
      integrations: results,
    })
  } catch (error: any) {
    console.error("Error checking integrations:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
