import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "userId parameter required" }, { status: 400 })
    }

    // Get all integrations for this user
    const { data: allIntegrations, error: allError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (allError) {
      console.error("Error fetching all integrations:", allError)
      return NextResponse.json({ error: allError.message }, { status: 500 })
    }

    // Get specifically YouTube integrations
    const { data: youtubeIntegrations, error: youtubeError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "youtube")
      .order("created_at", { ascending: false })

    if (youtubeError) {
      console.error("Error fetching YouTube integrations:", youtubeError)
      return NextResponse.json({ error: youtubeError.message }, { status: 500 })
    }

    return NextResponse.json({
      userId,
      totalIntegrations: allIntegrations?.length || 0,
      youtubeIntegrations: youtubeIntegrations?.length || 0,
      allIntegrations: allIntegrations?.map((i) => ({
        id: i.id,
        provider: i.provider,
        status: i.status,
        created_at: i.created_at,
        updated_at: i.updated_at,
        hasAccessToken: !!i.access_token,
        metadata: i.metadata,
      })),
      youtubeDetails: youtubeIntegrations?.map((i) => ({
        id: i.id,
        provider: i.provider,
        status: i.status,
        created_at: i.created_at,
        updated_at: i.updated_at,
        hasAccessToken: !!i.access_token,
        scopes: i.scopes,
        metadata: i.metadata,
      })),
    })
  } catch (error: any) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
