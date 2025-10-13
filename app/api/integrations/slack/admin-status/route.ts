import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, userId } = await request.json()
    if (!workspaceId || !userId) {
      return jsonResponse({ success: false, error: "Missing workspaceId or userId" }, { status: 400 })
    }
    // Get all Slack integrations for the user
    const credentials = await getIntegrationCredentials(userId, "slack")
    if (!credentials?.accessToken) {
      return jsonResponse({ success: false, error: "No Slack access token found" }, { status: 401 })
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
      return jsonResponse({ success: false, error: data.error }, { status: 400 })
    }
    const is_admin = data.user?.is_admin || false
    return jsonResponse({ success: true, is_admin })
  } catch (error: any) {
    return jsonResponse({ success: false, error: error.message }, { status: 500 })
  }
} 