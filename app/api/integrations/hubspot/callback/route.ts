import { db } from "@/lib/db"
import { accounts } from "@/lib/db/schema"
import { type NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get("code")
    const appId = searchParams.get("appId")
    const redirectUri = searchParams.get("redirectUri")
    const portalId = searchParams.get("portalId")

    if (!code || !appId || !redirectUri || !portalId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    // TODO: Exchange the authorization code for an access token
    // and refresh token using the HubSpot API.
    // This will involve making a POST request to the HubSpot OAuth 2.0 token endpoint.
    // Example:
    // const tokenEndpoint = 'https://api.hubapi.com/oauth/v1/token';
    // const tokenResponse = await fetch(tokenEndpoint, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/x-www-form-urlencoded',
    //   },
    //   body: new URLSearchParams({
    //     grant_type: 'authorization_code',
    //     client_id: appId,
    //     client_secret: 'YOUR_CLIENT_SECRET', // Replace with your actual client secret
    //     redirect_uri: redirectUri,
    //     code: code,
    //   }),
    // });

    // if (!tokenResponse.ok) {
    //   console.error('Failed to exchange authorization code for tokens:', await tokenResponse.text());
    //   return NextResponse.json({ error: 'Failed to exchange authorization code for tokens' }, { status: 500 });
    // }

    // const tokenData = await tokenResponse.json();
    // const accessToken = tokenData.access_token;
    // const refreshToken = tokenData.refresh_token;

    // For now, let's mock the access token and refresh token
    const accessToken = "mock_access_token"
    const refreshToken = "mock_refresh_token"

    // Store the access token and refresh token in the database
    // You'll likely want to associate these tokens with a user account.
    try {
      const existingAccount = await db.select().from(accounts).where(eq(accounts.hubspotPortalId, portalId))

      if (existingAccount.length > 0) {
        await db
          .update(accounts)
          .set({
            hubspotAccessToken: accessToken,
            hubspotRefreshToken: refreshToken,
          })
          .where(eq(accounts.hubspotPortalId, portalId))
      } else {
        await db.insert(accounts).values({
          hubspotPortalId: portalId,
          hubspotAccessToken: accessToken,
          hubspotRefreshToken: refreshToken,
        })
      }
    } catch (error) {
      console.error("Database error:", error)
      return NextResponse.json({ error: "Failed to store tokens in the database" }, { status: 500 })
    }

    // Redirect the user back to your application.
    const redirectURL = "/" // Replace with your desired redirect URL
    return NextResponse.redirect(new URL(redirectURL, req.url))
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
