import { type NextRequest, NextResponse } from "next/server"
import { generateId } from "lucia"
import { createClient } from "@/lib/supabase"

export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get("token") // Trello returns token directly
  const state = searchParams.get("state")

  if (!token) {
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_token`)
  }

  if (!state) {
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_state`)
  }

  try {
    // Parse state to get user ID
    const stateData = JSON.parse(atob(state))
    const userId = stateData.userId

    if (!userId) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_user_id`)
    }

    // Get user info from Trello
    const meResponse = await fetch(
      `https://api.trello.com/1/members/me?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${token}`,
    )

    if (!meResponse.ok) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=trello_me_fetch_failed`)
    }

    const meData = await meResponse.json()
    const trelloUserId = meData.id
    const trelloUsername = meData.username

    if (!trelloUserId || !trelloUsername) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_user_data`)
    }

    // Create Supabase client
    const supabase = createClient()

    // Save integration to database
    const { error } = await supabase.from("integrations").insert({
      id: generateId(21),
      user_id: userId,
      provider: "trello",
      provider_user_id: trelloUserId,
      access_token: token,
      status: "connected",
      scopes: ["read", "write"],
      metadata: {
        username: trelloUsername,
        connected_at: new Date().toISOString(),
      },
    })

    if (error) {
      console.error("Error saving Trello integration:", error)
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=trello_db_error`)
    }

    return NextResponse.redirect(`https://chainreact.app/integrations?success=trello_connected`)
  } catch (e) {
    console.error(e)
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=trello_general_error`)
  }
}
