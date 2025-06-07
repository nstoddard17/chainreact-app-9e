import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getBaseUrl } from "@/lib/utils"
import { OneDriveOAuthService } from "@/services/onedrive-oauth-service"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { provider, reconnect, integrationId } = body

    console.log("Generate auth URL request:", body) // This log is already showing

    // Get the current user
    const supabase = createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("Auth error in generate-url:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("User authenticated for auth URL generation:", user.id)

    const baseUrl = getBaseUrl(req)
    let authUrl: string

    // Generate auth URL based on provider
    switch (provider) {
      case "onedrive":
        authUrl = OneDriveOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, user.id)
        console.log("Generated OneDrive auth URL:", authUrl)
        break
      // ... other cases
    }

    return NextResponse.json({ authUrl })
  } catch (error: any) {
    console.error("Error generating auth URL:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
