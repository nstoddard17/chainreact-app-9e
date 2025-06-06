import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { linkedinProfileSchema } from "@/lib/validations/linkedin"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code || !state) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_code_or_state`)
    }

    const storedState = cookies().get("linkedin_oauth_state")?.value

    if (!storedState || state !== storedState) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=invalid_state`)
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
    const redirectUri = "https://chainreact.app/api/integrations/linkedin/callback"

    if (!clientId || !clientSecret) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_client_secrets`)
    }

    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}&client_id=${clientId}&client_secret=${clientSecret}`,
    })

    if (!tokenResponse.ok) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=token_request_failed`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_access_token`)
    }

    const profileResponse = await fetch("https://api.linkedin.com/v2/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!profileResponse.ok) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=profile_request_failed`)
    }

    const profileData = await profileResponse.json()

    const emailResponse = await fetch(
      "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!emailResponse.ok) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=email_request_failed`)
    }

    const emailData = await emailResponse.json()
    const email = emailData.elements[0]["handle~"].emailAddress

    const validatedProfile = linkedinProfileSchema.safeParse({
      linkedin_id: profileData.id,
      email: email,
      firstName: profileData.localizedFirstName,
      lastName: profileData.localizedLastName,
    })

    if (!validatedProfile.success) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=profile_validation_failed`)
    }

    const profile = validatedProfile.data

    const userId = cookies().get("user_id")?.value

    if (!userId) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_user_id`)
    }

    await db.linkedinProfile.upsert({
      where: { userId: userId },
      update: { ...profile, userId: userId },
      create: { ...profile, userId: userId },
    })

    return NextResponse.redirect(`https://chainreact.app/integrations?success=linkedin_connected`)
  } catch (error) {
    console.error("LinkedIn Callback Error:", error)
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=callback_error`)
  }
}
