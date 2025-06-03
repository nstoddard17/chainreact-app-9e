import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get("token")
  const state = searchParams.get("state")

  // Trello returns the token in the URL fragment, not as a query parameter
  // We need to handle this on the client side and pass it as a query parameter
  console.log("Trello OAuth callback:", {
    token: !!token,
    state: !!state,
    allParams: Object.fromEntries(searchParams.entries()),
    url: request.url,
  })

  // If no token in query params, redirect to a client-side handler
  if (!token) {
    console.log("No token in query params, redirecting to client-side handler")
    return NextResponse.redirect(new URL("/integrations?trello_auth=pending", request.url))
  }

  if (!state) {
    console.error("Missing state in Trello callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_state&provider=trello", request.url))
  }

  try {
    console.log("Processing Trello OAuth callback with token and state")

    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "trello") {
      throw new Error("Invalid provider in state")
    }

    console.log("Decoded state:", { provider, reconnect, integrationId })

    // Get user info from Trello
    console.log("Fetching user info from Trello API...")
    const userResponse = await fetch(
      `https://api.trello.com/1/members/me?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${token}`,
    )

    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      console.error("Failed to get Trello user info:", errorText)
      throw new Error(`Failed to get user info: ${userResponse.status}`)
    }

    const userData = await userResponse.json()
    console.log("Trello user data received:", { id: userData.id, username: userData.username })

    // Store integration in Supabase using server component client
    const supabase = createServerComponentClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Trello: Error retrieving session:", sessionError)
      throw new Error(`Session error: ${sessionError.message}`)
    }

    if (!sessionData?.session) {
      console.error("Trello: No session found")
      throw new Error("No session found")
    }

    console.log("Trello: Session successfully retrieved for user:", sessionData.session.user.id)

    const integrationData = {
      user_id: sessionData.session.user.id,
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

    console.log("Saving integration to database...")

    if (reconnect && integrationId) {
      console.log("Updating existing integration:", integrationId)
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) {
        console.error("Database update error:", error)
        throw error
      }
    } else {
      console.log("Creating new integration")
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) {
        console.error("Database insert error:", error)
        throw error
      }
    }

    console.log("Trello integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=trello_connected", request.url))
  } catch (error: any) {
    console.error("Trello OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=trello&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
