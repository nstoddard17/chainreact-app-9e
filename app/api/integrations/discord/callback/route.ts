import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { Lucia } from "lucia"
import { db } from "@/lib/db"
import { Discord } from "arctic"

const discord = new Discord(
  process.env.DISCORD_CLIENT_ID!,
  process.env.DISCORD_CLIENT_SECRET!,
  "https://chainreact.app/api/integrations/discord/callback", // Hardcoded redirect URI
)

const baseUrl = "https://chainreact.app" // Hardcoded base URL

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const storedState = cookies().get("discord_oauth_state")?.value ?? null

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(`${baseUrl}/integrations?error=invalid_state`) // Hardcoded base URL
  }

  try {
    const tokens = await discord.getTokens(code)
    const discordUser = await discord.getUser(tokens.accessToken)

    const existingUserIntegration = await db.userIntegration.findUnique({
      where: {
        providerId_userId: {
          providerId: discordUser.id,
          userId: "discord",
        },
      },
    })

    if (existingUserIntegration) {
      return NextResponse.redirect(`${baseUrl}/integrations?error=discord_already_connected`) // Hardcoded base URL
    }

    const sessionId = cookies().get("session")?.value

    if (!sessionId) {
      return NextResponse.redirect(`${baseUrl}/login?error=no_session`) // Hardcoded base URL
    }

    // Assuming you have a Lucia instance initialized elsewhere
    // and a way to get the user ID from the session ID
    // Replace this with your actual Lucia setup
    const lucia = new Lucia(null as any, {
      // Replace null as any with your adapter
      sessionCookie: {
        attributes: {
          secure: process.env.NODE_ENV === "production",
        },
      },
      getUserAttributes: (attributes) => {
        return attributes
      },
    })

    const { user } = await lucia.validateSession(sessionId)

    if (!user) {
      return NextResponse.redirect(`${baseUrl}/login?error=invalid_session`) // Hardcoded base URL
    }

    await db.userIntegration.create({
      data: {
        userId: "discord",
        providerId: discordUser.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          connect: {
            id: user.id,
          },
        },
      },
    })

    return NextResponse.redirect(`https://chainreact.app/integrations?success=discord_connected`) // Hardcoded base URL
  } catch (e) {
    console.error(e)
    return NextResponse.redirect(`${baseUrl}/integrations?error=discord_connection_failed`) // Hardcoded base URL
  }
}
