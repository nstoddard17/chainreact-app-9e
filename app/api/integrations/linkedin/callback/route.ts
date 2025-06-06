import { db } from "@/lib/db"
import { linkedinProfiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 })
  }

  try {
    // Exchange the authorization code for an access token
    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI || "",
        client_id: process.env.LINKEDIN_CLIENT_ID || "",
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || "",
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenData.access_token) {
      console.error("LinkedIn Token Error:", tokenData)
      return NextResponse.json({ error: "Failed to retrieve access token" }, { status: 500 })
    }

    const accessToken = tokenData.access_token

    // Use the access token to fetch the user's profile
    const profileResponse = await fetch("https://api.linkedin.com/v2/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const profileData = await profileResponse.json()

    if (!profileData.id) {
      console.error("LinkedIn Profile Error:", profileData)
      return NextResponse.json({ error: "Failed to retrieve profile data" }, { status: 500 })
    }

    const linkedinId = profileData.id
    const firstName = profileData.localizedFirstName
    const lastName = profileData.localizedLastName

    // Check if the LinkedIn profile already exists in the database
    const existingProfile = await db.select().from(linkedinProfiles).where(eq(linkedinProfiles.linkedinId, linkedinId))

    if (existingProfile.length > 0) {
      // Update the existing profile
      await db
        .update(linkedinProfiles)
        .set({
          firstName: firstName,
          lastName: lastName,
          accessToken: accessToken,
        })
        .where(eq(linkedinProfiles.linkedinId, linkedinId))

      console.log(`LinkedIn profile updated for LinkedIn ID: ${linkedinId}`)
    } else {
      // Create a new LinkedIn profile entry in the database
      await db.insert(linkedinProfiles).values({
        linkedinId: linkedinId,
        firstName: firstName,
        lastName: lastName,
        accessToken: accessToken,
      })

      console.log(`New LinkedIn profile created for LinkedIn ID: ${linkedinId}`)
    }

    return NextResponse.json({ message: "LinkedIn profile processed successfully" }, { status: 200 })
  } catch (error) {
    console.error("Error processing LinkedIn callback:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
