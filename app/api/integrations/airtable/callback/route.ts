import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { accounts, integrations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 })
  }

  try {
    // Fetch integration details from the database using the state
    const integrationDetails = await db.select().from(integrations).where(eq(integrations.id, state))

    if (!integrationDetails || integrationDetails.length === 0) {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 })
    }

    const integration = integrationDetails[0]

    // Exchange the code for an access token using Airtable's API
    const tokenEndpoint = "https://airtable.com/oauth2/token"
    const clientId = process.env.AIRTABLE_CLIENT_ID
    const clientSecret = process.env.AIRTABLE_CLIENT_SECRET
    const redirectUri = process.env.NEXT_PUBLIC_AIRTABLE_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      console.error("Missing Airtable environment variables")
      return NextResponse.json({ error: "Missing Airtable environment variables" }, { status: 500 })
    }

    const tokenParams = new URLSearchParams()
    tokenParams.append("grant_type", "authorization_code")
    tokenParams.append("code", code)
    tokenParams.append("redirect_uri", redirectUri)
    tokenParams.append("client_id", clientId)
    tokenParams.append("client_secret", clientSecret)

    const tokenResponse = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenParams,
    })

    if (!tokenResponse.ok) {
      console.error("Airtable token exchange failed:", tokenResponse.status, await tokenResponse.text())
      return NextResponse.json({ error: "Airtable token exchange failed" }, { status: 500 })
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token

    if (!accessToken) {
      console.error("Missing access token from Airtable")
      return NextResponse.json({ error: "Missing access token from Airtable" }, { status: 500 })
    }

    // Store the access token and other relevant data in your database, associated with the user and integration
    // Assuming you have a table named 'accounts' to store user-specific data
    // and you want to associate the Airtable access token with a specific account.

    // For simplicity, let's assume you have the account ID available.  In a real application,
    // you would likely retrieve the account ID based on the user's session or authentication context.
    const accountId = integration.accountId // Replace with the actual account ID retrieval logic

    if (!accountId) {
      console.error("Missing account ID")
      return NextResponse.json({ error: "Missing account ID" }, { status: 500 })
    }

    // Update the account with the Airtable access token
    await db
      .update(accounts)
      .set({
        airtableAccessToken: accessToken,
        airtableRefreshToken: refreshToken,
      })
      .where(eq(accounts.id, accountId))

    // Redirect the user to a success page or back to your application
    const successRedirectUrl = `/integrations/success?integrationId=${integration.id}` // Replace with your actual success page URL
    return NextResponse.redirect(new URL(successRedirectUrl, request.url))
  } catch (error) {
    console.error("Error during Airtable callback:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
