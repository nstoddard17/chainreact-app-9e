import { NextRequest, NextResponse } from "next/server"
import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, userId } = await request.json()
    if (!workspaceId || !userId) {
      return NextResponse.json({ success: false, error: "Missing workspaceId or userId" }, { status: 400 })
    }
    // Get all Slack integrations for the user
    const credentials = await getIntegrationCredentials(userId, "slack")
    if (!credentials?.accessToken) {
      return NextResponse.json({ success: false, error: "No Slack access token found" }, { status: 401 })
    }
    // For now, just use the first Slack integration
    // Fetch user info from Slack API
    const response = await fetch(`https://slack.com/api/users.info?user=${ userId}`, {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    })
    const data = await response.json()
    if (!data.ok) {
      return NextResponse.json({ success: false, error: data.error }, { status: 400 })
    }
    const is_admin = data.user?.is_admin || false
    return NextResponse.json({ success: true, is_admin })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
} 