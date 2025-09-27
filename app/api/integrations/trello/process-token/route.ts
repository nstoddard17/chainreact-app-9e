import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { validateAndUpdateIntegrationScopes } from "@/lib/integrations/scopeValidation"

const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server environment is not configured for Trello processing.")
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
  })
}

export const POST = async (request: NextRequest) => {
  try {
    const supabase = getSupabaseClient()
    console.log("Processing Trello token")
    const { token, userId } = await request.json()

    if (!token || !userId) {
      return NextResponse.json({ error: "Missing token or userId" }, { status: 400 })
    }

    // Get user info from Trello
    const trelloResponse = await fetch(
      `https://api.trello.com/1/members/me?key=${process.env.TRELLO_CLIENT_ID}&token=${token}`,
    )

    if (!trelloResponse.ok) {
      const errorText = await trelloResponse.text()
      console.error("Failed to fetch Trello user info:", errorText)
      return NextResponse.json({ error: "Failed to validate Trello token" }, { status: 400 })
    }

    const trelloUserData = await trelloResponse.json()
  const trelloUserId = trelloUserData.id
  const trelloUsername = trelloUserData.username

    if (!trelloUserId || !trelloUsername) {
      console.error("Invalid Trello user data received")
      return NextResponse.json({ error: "Invalid Trello user data" }, { status: 400 })
    }

    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id, metadata")
      .eq("user_id", userId)
      .eq("provider", "trello")
      .maybeSingle()

    const grantedScopes = ["read", "write", "account"]

    // Match Discord structure that works correctly
  const integrationData = {
    user_id: userId,
    provider: "trello",
    provider_user_id: trelloUserId,
    access_token: token,
    refresh_token: null, // Trello doesn't provide refresh tokens
    expires_at: null, // Trello tokens don't expire unless revoked
    status: "connected" as const,
    scopes: grantedScopes,
    metadata: {
      username: trelloUsername,
      full_name: trelloUserData.fullName || null,
      initials: trelloUserData.initials || null,
      avatar_url: trelloUserData.avatarUrl || null,
      url: trelloUserData.url || null,
      connected_at: now,
      client_key: process.env.TRELLO_CLIENT_ID || null,
      raw_user_data: trelloUserData,
    },
  }

    let integrationId: string | undefined
    if (existingIntegration) {
      console.log("Updating existing Trello integration")
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          access_token: token,
          provider_user_id: trelloUserId,
          status: "connected",
          updated_at: now,
          metadata: {
            ...(existingIntegration.metadata || {}),
            username: trelloUsername,
            full_name: trelloUserData.fullName || null,
            initials: trelloUserData.initials || null,
            avatar_url: trelloUserData.avatarUrl || null,
            url: trelloUserData.url || null,
            connected_at: now,
            client_key: process.env.TRELLO_CLIENT_ID || null,
            raw_user_data: trelloUserData,
          },
        })
        .eq("id", existingIntegration.id)
        .eq("user_id", userId)

      if (updateError) {
        console.error("Error updating Trello integration:", updateError)
        return NextResponse.json({ error: "Failed to update integration" }, { status: 500 })
      }
      integrationId = existingIntegration.id
    } else {
      console.log("Creating new Trello integration")
      const { data, error } = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single()

      if (error) {
        console.error("Error inserting Trello integration:", error)
        return NextResponse.json({ error: "Failed to create integration" }, { status: 500 })
      }
      integrationId = data.id
    }

    if (integrationId) {
      try {
        await validateAndUpdateIntegrationScopes(integrationId, grantedScopes)
        console.log("Trello integration scope validation completed")
      } catch (err) {
        console.error("Trello scope validation failed:", err)
        // Don't fail the whole process for scope validation errors
      }
    }

    console.log("Trello integration processed successfully")
    return NextResponse.json({ success: true, integrationId })
  } catch (e: any) {
    console.error("Error processing Trello token:", e)
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 })
  }
}
