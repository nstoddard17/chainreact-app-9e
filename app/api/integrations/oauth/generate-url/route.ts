import { type NextRequest, NextResponse } from "next/server"
import { generateAuthUrl } from "@/lib/oauth/oauthUtils"
import { getSession } from "@/utils/supabase/server"
import { hubspotOAuth } from "@/lib/oauth/hubspot"
import { generateOAuthState } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const provider = searchParams.get("provider")
    const scopes = searchParams.get("scopes")?.split(",") || []

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    const authUrl = await generateAuthUrl(provider, scopes)

    return NextResponse.json({ url: authUrl })
  } catch (error: any) {
    console.error("Error generating auth URL:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { provider, userId, scopes } = await request.json()

    if (!provider || !userId) {
      return NextResponse.json({ error: "Missing provider or userId" }, { status: 400 })
    }

    const state = generateOAuthState(provider, userId)

    let authUrl: string

    switch (provider.toLowerCase()) {
      case "hubspot":
        // Use minimal required scopes for HubSpot
        const hubspotScopes = scopes || [
          "oauth", // Required for OAuth
          "crm.objects.contacts.read",
          "crm.objects.companies.read",
        ]
        authUrl = hubspotOAuth.generateAuthUrl(state, hubspotScopes)
        break

      // Add other providers as needed
      default:
        return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
    }

    return NextResponse.json({ authUrl, state })
  } catch (error: any) {
    console.error("Error generating OAuth URL:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
