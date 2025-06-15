import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { generateOAuthState, getAbsoluteBaseUrl } from "@/lib/oauth/utils"

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerComponentClient({ cookies })

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { provider, reconnect = false, integrationId } = await request.json()

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    const baseUrl = getAbsoluteBaseUrl(request)

    // Generate state with user info
    const state = generateOAuthState({
      provider,
      userId: user.id,
      reconnect,
      integrationId,
      timestamp: Date.now(),
    })

    let authUrl: string

    switch (provider) {
      case "airtable":
        const airtableClientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
        if (!airtableClientId) {
          return NextResponse.json({ error: "Airtable integration not configured" }, { status: 500 })
        }

        const airtableParams = new URLSearchParams({
          client_id: airtableClientId,
          redirect_uri: `${baseUrl}/api/integrations/airtable/callback`,
          response_type: "code",
          state,
          scope: "data.records:read data.records:write schema.bases:read schema.bases:write",
        })

        authUrl = `https://airtable.com/oauth2/v1/authorize?${airtableParams.toString()}`
        break

      default:
        return NextResponse.json({ error: `Provider ${provider} not supported` }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      authUrl,
      provider,
    })
  } catch (error: any) {
    console.error("OAuth URL generation error:", error)
    return NextResponse.json({ error: "Failed to generate OAuth URL", details: error.message }, { status: 500 })
  }
}
