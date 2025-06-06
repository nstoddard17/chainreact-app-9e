import { db } from "@/lib/db"
import { dropboxIntegration } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code")
    const state = req.nextUrl.searchParams.get("state")

    if (!code) {
      return NextResponse.json({ error: "No code provided" }, { status: 400 })
    }

    if (!state) {
      return NextResponse.json({ error: "No state provided" }, { status: 400 })
    }

    // TODO: Verify state

    const clientId = process.env.DROPBOX_CLIENT_ID
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET
    const redirectUri = process.env.DROPBOX_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      console.error("Missing Dropbox environment variables")
      return NextResponse.json({ error: "Missing Dropbox environment variables" }, { status: 500 })
    }

    const tokenUrl = "https://api.dropboxapi.com/oauth2/token"

    const params = new URLSearchParams()
    params.append("code", code)
    params.append("grant_type", "authorization_code")
    params.append("client_id", clientId)
    params.append("client_secret", clientSecret)
    params.append("redirect_uri", redirectUri)

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    })

    if (!response.ok) {
      console.error("Failed to retrieve access token from Dropbox:", response.status, response.statusText)
      const errorText = await response.text()
      console.error("Error response:", errorText)
      return NextResponse.json({ error: "Failed to retrieve access token from Dropbox" }, { status: 500 })
    }

    const data = await response.json()
    const accessToken = data.access_token
    const accountId = data.account_id

    if (!accessToken || !accountId) {
      console.error("Missing access token or account ID from Dropbox response")
      return NextResponse.json({ error: "Missing access token or account ID from Dropbox response" }, { status: 500 })
    }

    // Store the access token and account ID in the database
    try {
      const existingIntegration = await db
        .select()
        .from(dropboxIntegration)
        .where(eq(dropboxIntegration.accountId, accountId))

      if (existingIntegration.length > 0) {
        // Update existing integration
        await db
          .update(dropboxIntegration)
          .set({ accessToken: accessToken })
          .where(eq(dropboxIntegration.accountId, accountId))
      } else {
        // Create new integration
        await db.insert(dropboxIntegration).values({ accountId: accountId, accessToken: accessToken })
      }

      return NextResponse.json({ message: "Dropbox integration successful" }, { status: 200 })
    } catch (error) {
      console.error("Failed to store Dropbox integration in database:", error)
      return NextResponse.json({ error: "Failed to store Dropbox integration in database" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error during Dropbox callback:", error)
    return NextResponse.json({ error: "Error during Dropbox callback" }, { status: 500 })
  }
}
