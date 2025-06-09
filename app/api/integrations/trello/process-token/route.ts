import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { validateAndUpdateIntegrationScopes } from "@/lib/integrations/scopeValidation"

// Use direct Supabase client with service role for reliable database operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

export const POST = async (request: NextRequest) => {
  try {
    const { token, userId } = await request.json()

    if (!token) {
      return NextResponse.json({ error: "No token provided" }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: "No user ID provided" }, { status: 400 })
    }

    console.log("Processing Trello token for user:", userId)

    // Get user info from Trello
    const meResponse = await fetch(
      `https://api.trello.com/1/members/me?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${token}`,
    )

    if (!meResponse.ok) {
      const errorText = await meResponse.text()
      console.error("Failed to fetch Trello user info:", errorText)
      return NextResponse.json({ error: "Failed to validate Trello token" }, { status: 400 })
    }

    const meData = await meResponse.json()
    const trelloUserId = meData.id
    const trelloUsername = meData.username

    if (!trelloUserId || !trelloUsername) {
      return NextResponse.json({ error: "Invalid Trello user data" }, { status: 400 })
    }

    console.log("Trello user data:", { id: trelloUserId, username: trelloUsername })

    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "trello")
      .maybeSingle()

    const grantedScopes = ["read", "write"]

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
        full_name: meData.fullName || null,
        initials: meData.initials || null,
        avatar_url: meData.avatarUrl || null,
        url: meData.url || null,
        connected_at: now,
        raw_user_data: meData,
      },
    }

    let integrationId: string | undefined
    if (existingIntegration) {
      console.log("Updating existing Trello integration:", existingIntegration.id)
      const { data, error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: now,
        })
        .eq("id", existingIntegration.id)
        .select("id")
        .single()

      if (error) {
        console.error("Error updating Trello integration:", error)
        return NextResponse.json({ error: "Failed to update integration" }, { status: 500 })
      }
      integrationId = data.id
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

    console.log("Trello integration processed successfully:", integrationId)
    return NextResponse.json({ success: true, integrationId })
  } catch (e: any) {
    console.error("Error processing Trello token:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
