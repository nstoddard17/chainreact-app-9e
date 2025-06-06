// lib/oauth/genericCallback.ts

// This file will contain the generic callback logic for OAuth providers.
// It will handle tasks like:
// 1. Verifying the state parameter.
// 2. Exchanging the authorization code for an access token.
// 3. Fetching user profile information from the provider.
// 4. Creating or updating the user in the database.
// 5. Creating a session for the user.
// 6. Redirecting the user to the appropriate page.

import { db } from "@/lib/db"
import { accounts, sessions, users } from "@/lib/db/schema"
import { generateId } from "lucia"
import { OAuth2RequestError } from "arctic"
import { eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { lucia } from "@/lib/auth"

export async function genericCallback(
  providerName: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
  state: string,
  expectedState: string,
  getUser: (accessToken: string) => Promise<{
    userId: string
    email: string
    name: string
  }>,
) {
  if (state !== expectedState) {
    throw new Error("Invalid state")
  }

  try {
    const tokens = await exchangeCode(code, clientId, clientSecret, redirectUri)
    const userProfile = await getUser(tokens.accessToken)

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, userProfile.email),
    })

    if (existingUser) {
      // User exists, create a session for them
      const sessionId = generateId(40)
      await db.insert(sessions).values({
        id: sessionId,
        userId: existingUser.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })

      const sessionCookie = lucia.createSessionCookie(sessionId)
      cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
      return
    }

    // User does not exist, create a new user and account
    const userId = generateId(15)
    await db.insert(users).values({
      id: userId,
      email: userProfile.email,
      name: userProfile.name,
    })

    await db.insert(accounts).values({
      userId: userId,
      provider: providerName,
      providerAccountId: userProfile.userId,
    })

    const sessionId = generateId(40)
    await db.insert(sessions).values({
      id: sessionId,
      userId: userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    })

    const sessionCookie = lucia.createSessionCookie(sessionId)
    cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
  } catch (e) {
    console.error("OAuth callback error:", e)
    if (e instanceof OAuth2RequestError) {
      // invalid code, invalid redirect URI, or invalid client
      return new Response(null, {
        status: 400,
      })
    }
    return new Response(null, {
      status: 500,
    })
  }
}

async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const tokenEndpoint = "https://example.com/oauth/token" // Replace with actual token endpoint

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  if (!response.ok) {
    console.error("Token exchange failed:", response.status, response.statusText)
    throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`)
  }

  const tokens = await response.json()

  if (!tokens.access_token) {
    console.error("Missing access token in response:", tokens)
    throw new Error("Missing access token in response")
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
  }
}
