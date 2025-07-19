import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has Facebook integration
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "facebook")
      .eq("status", "connected")
      .single()

    if (integrationError || !integration) {
      return NextResponse.json({
        hasIntegration: false,
        error: "No Facebook integration found"
      })
    }

    return NextResponse.json({
      hasIntegration: true,
      integration: {
        id: integration.id,
        provider: integration.provider,
        status: integration.status,
        hasAccessToken: !!integration.access_token,
        hasRefreshToken: !!integration.refresh_token
      }
    })

  } catch (error: any) {
    console.error("Facebook integration test error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
} 