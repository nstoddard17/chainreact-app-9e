import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get("token")
  const state = searchParams.get("state")

  console.log("Trello OAuth callback:", { token: !!token, state })

  if (!token || !state) {
    console.error("Missing token or state in Trello callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "trello") {
      throw new Error("Invalid provider in state")
    }

    // Get user info from Trello
    const userResponse = await fetch(
      `https://api.trello.com/1/members/me?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${token}`,
    )

    if (!userResponse.ok) {
      throw new Error("Failed to get user info")
    }

    const userData = await userResponse.json()

    // Store integration in Supabase
    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      throw new Error("No session found")
    }

    const integrationData = {
      user_id: session.user.id,
      provider: "trello",
      provider_user_id: userData.id,
      access_token: token,
      status: "connected" as const,
      scopes: ["read", "write"],
      metadata: {
        user_name: userData.fullName,
        username: userData.username,
        user_email: userData.email,
        connected_at: new Date().toISOString(),
      },
    }

    if (reconnect && integrationId) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) throw error
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) throw error
    }

    console.log("Trello integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=trello_connected", request.url))
  } catch (error: any) {
    console.error("Trello OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=callback_failed", request.url))
  }
}
