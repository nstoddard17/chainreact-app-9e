import { db } from "@/lib/db"
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { absoluteUrl } from "@/lib/utils"
import { validateAndUpdateIntegrationScopes } from "@/lib/integrations/scopeValidation"

const postSchema = z.object({
  code: z.string(),
  integrationId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const redirect_uri = absoluteUrl("/api/integrations/discord/callback")
  const scopes = ["identify", "email", "guilds", "guilds.join"].join(" ")

  const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${redirect_uri}&response_type=code&scope=${scopes}`

  return NextResponse.redirect(url)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { getUser } = getKindeServerSession()
    const user = await getUser()

    if (!user) {
      return new NextResponse("Unauthorized", { status: 403 })
    }

    const { code, integrationId } = postSchema.parse(body)

    const redirect_uri = absoluteUrl("/api/integrations/discord/callback")

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirect_uri,
      }),
      cache: "no-store",
    })

    if (!tokenResponse.ok) {
      console.error("Discord token exchange failed:", tokenResponse.status, await tokenResponse.text())
      return new NextResponse("Failed to exchange code for token", { status: 400 })
    }

    const tokenData = await tokenResponse.json()

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      cache: "no-store",
    })

    if (!userResponse.ok) {
      console.error("Discord user fetch failed:", userResponse.status, await userResponse.text())
      return new NextResponse("Failed to fetch user data from Discord", { status: 400 })
    }

    const userData = await userResponse.json()

    const emailResponse = await fetch("https://discord.com/api/users/@me/emails", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      cache: "no-store",
    })

    let emailData = []

    if (emailResponse.ok) {
      emailData = await emailResponse.json()
    }

    const primaryEmail = emailData.find((email: any) => email.primary)

    // After getting the token response and before updating the database
    const grantedScopes = tokenData.scope ? tokenData.scope.split(" ") : []

    // Validate the scopes
    const validationResult = await validateAndUpdateIntegrationScopes(integrationId || undefined, grantedScopes)

    console.log("Discord scope validation result:", validationResult)

    if (integrationId) {
      await db.integration.update({
        where: {
          id: integrationId,
        },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
          scopes: grantedScopes,
          verified: validationResult.valid,
          verifiedScopes: grantedScopes,
          data: {
            ...userData,
            email: primaryEmail?.email || userData.email,
          },
        },
      })
    } else {
      const newIntegration = await db.integration.create({
        data: {
          userId: user.id!,
          type: "discord",
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
          scopes: grantedScopes,
          verified: validationResult.valid,
          verifiedScopes: grantedScopes,
          data: {
            ...userData,
            email: primaryEmail?.email || userData.email,
          },
        },
      })
    }

    return new NextResponse("OK")
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse("Invalid request", { status: 400 })
    }

    console.error("Error during Discord callback:", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
