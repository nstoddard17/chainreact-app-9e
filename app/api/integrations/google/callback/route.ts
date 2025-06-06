import { google } from "googleapis"
import { generateId, lucia } from "@/lib/auth"
import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/integrations?error=google_code_missing`)
    }

    if (!state) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/integrations?error=google_state_missing`)
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/google/callback`,
    )

    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/integrations?error=google_tokens_missing`)
    }

    oauth2Client.setCredentials(tokens)

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2",
    })

    const googleUser = await oauth2.userinfo.get()

    if (!googleUser.data.email) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/integrations?error=google_email_missing`)
    }

    let decodedState
    try {
      decodedState = JSON.parse(decodeURIComponent(state))
    } catch {
      // If state parsing fails, try to find or create user by email
      const { data: existingUser } = await supabase
        .from("users")
        .select("*")
        .eq("email", googleUser.data.email)
        .single()

      if (existingUser) {
        decodedState = { userId: existingUser.id }
      } else {
        // Create new user
        const userId = generateId(15)
        const { data: newUser } = await supabase
          .from("users")
          .insert({
            id: userId,
            email: googleUser.data.email,
            name: googleUser.data.name,
          })
          .select()
          .single()

        decodedState = { userId: newUser.id }
      }
    }

    if (!decodedState?.userId) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/integrations?error=user_id_missing`)
    }

    // Store Google integration
    await supabase.from("integrations").upsert({
      user_id: decodedState.userId,
      provider: "google",
      provider_account_id: googleUser.data.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
      token_type: tokens.token_type,
      scope: tokens.scope,
      is_active: true,
      updated_at: new Date().toISOString(),
    })

    // Create a session for the user
    const sessionId = generateId(40)
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) // 30 days

    await supabase.from("sessions").insert({
      id: sessionId,
      user_id: decodedState.userId,
      expires_at: expiresAt.toISOString(),
    })

    // Set session cookie
    const sessionCookie = lucia.createSessionCookie(sessionId)
    cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/integrations?success=google_connected`)
  } catch (error) {
    console.error("Google callback error:", error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/integrations?error=google_callback_failed`)
  }
}
