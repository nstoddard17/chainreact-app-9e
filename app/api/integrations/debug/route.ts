import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "No session" }, { status: 401 })
    }

    // Get recent integrations
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(10)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      user_id: session.user.id,
      integrations_count: integrations?.length || 0,
      recent_integrations:
        integrations?.map((i) => ({
          id: i.id,
          provider: i.provider,
          status: i.status,
          created_at: i.created_at,
          metadata: i.metadata,
        })) || [],
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
