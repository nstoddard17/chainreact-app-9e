import { type NextRequest, NextResponse } from "next/server"
import { generateOAuthUrl } from "@/lib/oauth"

export async function POST(request: NextRequest) {
  try {
    const { provider, userId } = await request.json()

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    // Generate the OAuth URL
    const authUrl = generateOAuthUrl(provider, "https://chainreact.app", false, undefined, userId)

    return NextResponse.json({ authUrl })
  } catch (error: any) {
    console.error("Failed to generate OAuth URL:", error)
    return NextResponse.json({ error: error.message || "Failed to generate OAuth URL" }, { status: 500 })
  }
}
