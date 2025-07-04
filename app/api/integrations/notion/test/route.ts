import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Get Notion integration
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "notion")
      .eq("status", "connected")
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        {
          error: "No connected Notion integration found",
          details: integrationError?.message,
        },
        { status: 404 },
      )
    }

    interface TestResult {
      integrationFound: boolean
      integrationStatus: any
      tokenValid: boolean
      apiResponseStatus: number
      integration: {
        id: any
        provider_user_id: any
        scopes: any
        created_at: any
        updated_at: any
      }
      userData?: any
      apiError?: any
    }

    // Test the Notion API with the stored token
    const testResponse = await fetch("https://api.notion.com/v1/users/me", {
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        "Notion-Version": "2022-06-28",
      },
    })

    const testResult: TestResult = {
      integrationFound: true,
      integrationStatus: integration.status,
      tokenValid: testResponse.ok,
      apiResponseStatus: testResponse.status,
      integration: {
        id: integration.id,
        provider_user_id: integration.provider_user_id,
        scopes: integration.scopes,
        created_at: integration.created_at,
        updated_at: integration.updated_at,
      },
    }

    if (testResponse.ok) {
      const userData = await testResponse.json()
      testResult.userData = userData
    } else {
      testResult.apiError = await testResponse.text()
    }

    return NextResponse.json(testResult)
  } catch (error: any) {
    console.error("Notion test endpoint error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
