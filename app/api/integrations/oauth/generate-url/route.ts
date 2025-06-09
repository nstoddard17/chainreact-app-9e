import { type NextRequest, NextResponse } from "next/server"
import { generateAuthUrl } from "@/lib/oauth/oauthUtils"
import { getSession } from "@/utils/supabase/server"

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
