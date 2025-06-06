import { db } from "@/lib/db"
import { accounts } from "@/lib/db/schema"
import { discord } from "@/lib/discord"
import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "next-auth/react"

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const state = req.nextUrl.searchParams.get("state")

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 })
  }

  if (!state) {
    return NextResponse.json({ error: "No state provided" }, { status: 400 })
  }

  try {
    const tokenResponse = await discord.getToken(code)
    const discordUser = await discord.getUser(tokenResponse.access_token)

    const existingAccount = await db.query.accounts.findFirst({
      where: (accounts, { eq }) => eq(accounts.providerAccountId, discordUser.id),
    })

    if (existingAccount) {
      // Account exists, return success
      return NextResponse.json({ success: true })
    }

    const session = await getSession()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "No session found" }, { status: 401 })
    }

    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, session.user.email!),
    })

    if (!existingUser) {
      return NextResponse.json({ error: "No user found" }, { status: 404 })
    }

    await db.insert(accounts).values({
      userId: existingUser.id,
      type: "oauth",
      provider: "discord",
      providerAccountId: discordUser.id,
      access_token: tokenResponse.access_token,
      expires_at: tokenResponse.expires_in ? Math.floor(Date.now() / 1000 + tokenResponse.expires_in) : null,
      token_type: tokenResponse.token_type,
      scope: tokenResponse.scope,
      refresh_token: tokenResponse.refresh_token,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Discord callback error:", error)
    return NextResponse.json({ error: "Failed to authenticate with Discord" }, { status: 500 })
  }
}
