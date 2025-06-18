import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Get all integrations for this user
    const { data: integrations, error: integrationsError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)

    if (integrationsError) {
      return NextResponse.json({ error: integrationsError.message }, { status: 500 })
    }

    // Check localStorage for integration store state
    let localStorageState = null
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("integration-storage")
        if (stored) {
          localStorageState = JSON.parse(stored)
        }
      }
    } catch (e) {
      console.error("Error reading localStorage:", e)
    }

    return NextResponse.json({
      userId: user.id,
      userEmail: user.email,
      totalIntegrations: integrations?.length || 0,
      integrations: integrations?.map((i) => ({
        id: i.id,
        provider: i.provider,
        status: i.status,
        created_at: i.created_at,
        updated_at: i.updated_at,
      })),
      localStorageState,
      debug: {
        request_timestamp: new Date().toISOString(),
        user_agent: request.headers.get("user-agent"),
      }
    })
  } catch (error: any) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
} 