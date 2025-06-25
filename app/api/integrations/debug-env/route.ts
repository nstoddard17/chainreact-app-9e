import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "../../../../utils/supabase/server"

export async function GET() {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    // Check authentication
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check which environment variables are available
    const envCheck = {
      // Google credentials
      hasGoogleClientId: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,

      // YouTube-specific credentials
      hasYouTubeClientId: !!process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID,
      hasYouTubeClientSecret: !!process.env.YOUTUBE_CLIENT_SECRET,

      // Show partial values for verification (first 5 chars only for security)
      googleClientIdPreview: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.substring(0, 5) + "...",
      youtubeClientIdPreview: process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID?.substring(0, 5) + "...",

      // Check if they're the same
      sameClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID === process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID,

      // What the YouTube callback will actually use
      actualClientId:
        (process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)?.substring(0, 5) +
        "...",
      actualClientSecret: !!(process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET),
    }

    return NextResponse.json({
      message: "Environment variable check",
      ...envCheck,
      recommendation:
        envCheck.hasGoogleClientId && envCheck.hasGoogleClientSecret
          ? "Use Google credentials (recommended for all Google services)"
          : envCheck.hasYouTubeClientId && envCheck.hasYouTubeClientSecret
            ? "Use YouTube-specific credentials"
            : "Missing required credentials",
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to check environment variables", details: error.message },
      { status: 500 },
    )
  }
}
