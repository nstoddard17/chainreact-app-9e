import { type NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { generateAuthUrl } from "@/lib/oauth/oauthUtils"

export async function POST(request: NextRequest) {
  try {
    console.log("🔗 Generate URL endpoint called")

    const body = await request.json()
    const { provider } = body

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    console.log(`🔗 Generating URL for provider: ${provider}`)

    // Get user from session
    const supabase = createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("❌ Authentication error:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log(`👤 User authenticated: ${user.id}`)

    // Generate OAuth URL
    const authUrl = await generateAuthUrl(provider, [], user.id, {
      returnUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/integrations`,
    })

    console.log(`✅ Generated auth URL for ${provider}`)

    return NextResponse.json({
      success: true,
      authUrl,
      provider,
    })
  } catch (error: any) {
    console.error("❌ Error generating auth URL:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate auth URL",
      },
      { status: 500 },
    )
  }
}
