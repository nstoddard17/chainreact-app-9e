import { db } from "@/lib/db"
import { trelloIntegration } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code || !state) {
      return NextResponse.json({ error: "Missing code or state" }, { status: 400 })
    }

    // Fetch the Trello integration from the database using the state as the integrationId
    const integrations = await db.select().from(trelloIntegration).where(eq(trelloIntegration.integrationId, state))

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    const integration = integrations[0]

    // Exchange the code for an access token
    const tokenUrl = "https://trello.com/1/OAuthGetAccessToken"
    const apiKey = process.env.TRELLO_API_KEY
    const tokenSecret = process.env.TRELLO_API_SECRET

    if (!apiKey || !tokenSecret) {
      console.error("Trello API key or secret not found in environment variables.")
      return NextResponse.json({ error: "Missing Trello API key or secret" }, { status: 500 })
    }

    const tokenParams = new URLSearchParams({
      oauth_consumer_key: apiKey,
      oauth_token: code,
      oauth_signature_method: "PLAINTEXT",
      oauth_timestamp: Date.now().toString(),
      oauth_nonce: Math.random().toString(36).substring(2),
      oauth_version: "1.0",
      oauth_signature: `${tokenSecret}&`,
    })

    const tokenResponse = await fetch(`${tokenUrl}?${tokenParams.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    })

    if (!tokenResponse.ok) {
      console.error("Failed to exchange code for token:", tokenResponse.status, await tokenResponse.text())
      return NextResponse.json({ error: "Failed to exchange code for token" }, { status: 500 })
    }

    const tokenData = await tokenResponse.text()
    const oauthToken = tokenData.split("oauth_token=")[1].split("&")[0]
    const oauthTokenSecret = tokenData.split("oauth_token_secret=")[1].split("&")[0]

    // Update the Trello integration in the database with the access token and secret
    await db
      .update(trelloIntegration)
      .set({ accessToken: oauthToken, accessTokenSecret: oauthTokenSecret })
      .where(eq(trelloIntegration.integrationId, state))

    // Redirect the user back to the success page
    return NextResponse.redirect(new URL("/integrations/success", req.url))
  } catch (error) {
    console.error("Trello callback error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
