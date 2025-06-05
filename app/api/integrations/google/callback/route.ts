import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { Lucia } from "lucia"
import { db } from "@/lib/db"
import { google } from "googleapis"
import { generateId } from "lucia"
import { OAuthAccount } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { validateAndUpdateIntegrationScopes } from "@/lib/integrations/scopeValidation"

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ""
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || ""

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)

const lucia = new Lucia(db, {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === "production",
    },
  },
})

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return new NextResponse(null, {
      status: 400,
    })
  }

  try {
    const storedState = cookies().get("google_oauth_state")?.value ?? null
    const storedCodeVerifier = cookies().get("google_oauth_code_verifier")?.value ?? null

    if (!storedState || !storedCodeVerifier || storedState !== state) {
      return new NextResponse(null, {
        status: 400,
      })
    }

    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      console.log("Failed to get tokens from Google")
      return new NextResponse(null, {
        status: 400,
      })
    }

    const googleUserResult = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    const googleUser = await googleUserResult.json()

    if (!googleUser.email) {
      console.log("Failed to get user details from Google")
      return new NextResponse(null, {
        status: 400,
      })
    }

    const existingAccount = await db.query.OAuthAccount.findFirst({
      where: (OAuthAccount, { eq }) => eq(OAuthAccount.providerId, googleUser.email),
    })

    if (existingAccount) {
      const session = await lucia.createSession(existingAccount.userId, {})
      const sessionCookie = lucia.createSessionCookie(session.id)
      cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
      return NextResponse.redirect(new URL("/", request.url), { status: 302 })
    }

    const stateData = JSON.parse(Buffer.from(state, "base64").toString("utf-8"))
    const integrationId = stateData.integrationId

    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
    }

    // Exchange the code for tokens
    // const { tokens } = await oauth2Client.getToken(code);

    // After getting the token response and before updating the database
    const grantedScopes = tokenData.scope ? tokenData.scope.split(" ") : []

    // Validate the scopes for the specific Google service
    const provider = stateData.provider || "google-calendar" // Default to calendar if not specified
    const validationResult = await validateAndUpdateIntegrationScopes(
      integrationId || "", //newIntegration.id,
      grantedScopes,
    )

    console.log(`Google ${provider} scope validation result:`, validationResult)

    if (integrationId) {
      // Update existing integration
      await db.execute(
        db
          .update(OAuthAccount)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expiry_date,
            scopes: grantedScopes,
            verified: validationResult.valid,
            verifiedScopes: grantedScopes,
          })
          .where(eq(OAuthAccount.id, integrationId)),
      )
    } else {
      // Create a new user and integration
      const userId = generateId(15)
      const newIntegrationId = generateId(20)

      await db.execute(
        db.insert(OAuthAccount).values({
          id: newIntegrationId,
          userId: userId,
          providerId: googleUser.email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date,
          scopes: grantedScopes,
          verified: validationResult.valid,
          verifiedScopes: grantedScopes,
        }),
      )

      const session = await lucia.createSession(userId, {})
      const sessionCookie = lucia.createSessionCookie(session.id)
      cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
    }

    return NextResponse.redirect(new URL("/", request.url), { status: 302 })
  } catch (e) {
    console.error(e)
    return new NextResponse(null, {
      status: 500,
    })
  }
}
