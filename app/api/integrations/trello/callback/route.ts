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

export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get("token") // Trello returns token directly
  const state = searchParams.get("state")
  const baseUrl = "https://chainreact.app"

  if (!token) {
    console.error("No token received from Trello")
    return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_token`)
  }

  if (!state) {
    console.error("No state received from Trello")
    return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_state`)
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(`${baseUrl}/integrations?error=invalid_state&provider=trello`)
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_user_id`)
    }

    // Get user info from Trello
    const meResponse = await fetch(
      `https://api.trello.com/1/members/me?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${token}`,
    )

    if (!meResponse.ok) {
      console.error("Failed to fetch Trello user info:", await meResponse.text())
      return NextResponse.redirect(`${baseUrl}/integrations?error=trello_me_fetch_failed`)
    }

    const meData = await meResponse.json()
    const trelloUserId = meData.id
    const trelloUsername = meData.username

    if (!trelloUserId || !trelloUsername) {
      console.error("Missing Trello user data")
      return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_user_data`)
    }

    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "trello")
      .maybeSingle()

    const grantedScopes = ["read", "write"]

    const integrationData = {
      user_id: userId,
      provider: "trello",
      provider_user_id: trelloUserId,
      access_token: token,
      status: "connected" as const,
      scopes: grantedScopes,
      granted_scopes: grantedScopes,
      metadata: {
        username: trelloUsername,
        full_name: meData.fullName,
        connected_at: now,
      },
      updated_at: now,
    }

    let integrationId: string | undefined
    if (existingIntegration) {
      const { data, error } = await supabase
        .from("integrations")
        .update(integrationData)
        .eq("id", existingIntegration.id)
        .select("id")
        .single()

      if (error) {
        console.error("Error updating Trello integration:", error)
        return NextResponse.redirect(`${baseUrl}/integrations?error=database_update_failed&provider=trello`)
      }
      integrationId = data.id
    } else {
      const { data, error } = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: now,
        })
        .select("id")
        .single()

      if (error) {
        console.error("Error inserting Trello integration:", error)
        return NextResponse.redirect(`${baseUrl}/integrations?error=database_insert_failed&provider=trello`)
      }
      integrationId = data.id
    }

    if (integrationId) {
      try {
        await validateAndUpdateIntegrationScopes(integrationId, grantedScopes)
      } catch (err) {
        console.error("Trello scope validation failed:", err)
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(`${baseUrl}/integrations?success=trello_connected&provider=trello&t=${Date.now()}`)
  } catch (e: any) {
    console.error("Error during Trello callback:", e)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=trello_general_error&message=${encodeURIComponent(e.message)}`,
    )
  }
}
