import { NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Debug endpoint only available in development" }, { status: 403 })
  }

  try {
    const supabase = getSupabaseClient()
    const { data: session } = await supabase.auth.getSession()

    if (!session?.session) {
      return NextResponse.json({ error: "No session found" }, { status: 401 })
    }

    // Get all integrations for the current user
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", session.session.user.id)

    if (error) {
      console.error("Error fetching integrations:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get environment variables related to integrations
    const integrationEnvVars = {
      NEXT_PUBLIC_TEAMS_CLIENT_ID: process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID ? "set" : "not set",
      TEAMS_CLIENT_SECRET: process.env.TEAMS_CLIENT_SECRET ? "set" : "not set",
      NEXT_PUBLIC_SLACK_CLIENT_ID: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID ? "set" : "not set",
      SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET ? "set" : "not set",
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? "set" : "not set",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? "set" : "not set",
      NEXT_PUBLIC_GITHUB_CLIENT_ID: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ? "set" : "not set",
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ? "set" : "not set",
      NEXT_PUBLIC_DISCORD_CLIENT_ID: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ? "set" : "not set",
      DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET ? "set" : "not set",
    }

    return NextResponse.json({
      integrations,
      integrationEnvVars,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || "not set",
    })
  } catch (error: any) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
