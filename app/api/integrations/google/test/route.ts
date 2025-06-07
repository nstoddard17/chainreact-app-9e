import { type NextRequest, NextResponse } from "next/server"
import { GoogleApiClient } from "@/lib/integrations/googleApiClient"
import { validateSession } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  try {
    // Validate user session
    const userId = await validateSession(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Create Google API client
    const googleClient = new GoogleApiClient(userId)

    // Test various Google APIs with automatic token refresh
    const results = {
      userInfo: null as any,
      driveFiles: null as any,
      calendarEvents: null as any,
      error: null as string | null,
    }

    try {
      // Test user info
      results.userInfo = await googleClient.getUserInfo()
      console.log("✅ Google user info retrieved successfully")
    } catch (error: any) {
      console.error("❌ Failed to get user info:", error.message)
      results.error = error.message
    }

    try {
      // Test Drive files
      results.driveFiles = await googleClient.listDriveFiles(5)
      console.log("✅ Google Drive files retrieved successfully")
    } catch (error: any) {
      console.error("❌ Failed to get Drive files:", error.message)
      if (!results.error) results.error = error.message
    }

    try {
      // Test Calendar events
      results.calendarEvents = await googleClient.listCalendarEvents("primary", 5)
      console.log("✅ Google Calendar events retrieved successfully")
    } catch (error: any) {
      console.error("❌ Failed to get Calendar events:", error.message)
      if (!results.error) results.error = error.message
    }

    return NextResponse.json({
      success: !results.error,
      message: results.error || "All Google API tests passed",
      data: results,
    })
  } catch (error: any) {
    console.error("Google API test error:", error)
    return NextResponse.json({ error: error.message || "Failed to test Google APIs" }, { status: 500 })
  }
}
