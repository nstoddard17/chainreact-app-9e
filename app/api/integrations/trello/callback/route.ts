import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { generateId } from "lucia"
import { db } from "@/db"
import { trelloIntegrationTable } from "@/db/schema"

export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code) {
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_code`)
  }

  if (!state) {
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_state`)
  }

  const storedState = cookies().get("trello_oauth_state")?.value

  if (!storedState) {
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_stored_state`)
  }

  if (state !== storedState) {
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=trello_invalid_state`)
  }

  try {
    const redirectUri = "https://chainreact.app/api/integrations/trello/callback"

    const tokenResponse = await fetch("https://trello.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.TRELLO_API_KEY as string,
        client_secret: process.env.TRELLO_API_SECRET as string,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=trello_token_exchange_failed`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=trello_no_access_token`)
    }

    const meResponse = await fetch("https://api.trello.com/1/members/me?fields=id,username", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

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

    const sessionId = cookies().get("session")?.value

    if (!sessionId) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=no_session`)
    }

    await db
      .insert(trelloIntegrationTable)
      .values({
        id: generateId(21),
        sessionId: sessionId,
        trelloUserId: trelloUserId,
        trelloUsername: trelloUsername,
        accessToken: accessToken,
      })
      .onConflictDoUpdate({
        target: trelloIntegrationTable.sessionId,
        set: {
          trelloUserId: trelloUserId,
          trelloUsername: trelloUsername,
          accessToken: accessToken,
        },
      })

    return NextResponse.redirect(`https://chainreact.app/integrations?success=trello_connected`)
  } catch (e) {
    console.error(e)
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=trello_general_error`)
  }
}
