import { NextRequest, NextResponse } from "next/server"
import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, userId } = await request.json()
    if (!userId) {
      return jsonResponse({ success: false, error: "Missing userId" }, { status: 400 })
    }
    // Get all Slack integrations for the user
    const credentials = await getIntegrationCredentials(userId, "slack")
    if (!credentials?.accessToken) {
      return jsonResponse({ success: false, error: "No Slack access token found" }, { status: 401 })
    }
    // If workspaceId is provided, filter to the correct integration (if you store workspace/team IDs in metadata)
    // For now, just use the first Slack integration
    // Fetch users from Slack API
    const response = await fetch("https://slack.com/api/users.list", {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    })
    const data = await response.json()
    if (!data.ok) {
      return jsonResponse({ success: false, error: data.error }, { status: 400 })
    }
    const users = (data.members || []).map((u: any) => ({
      id: u.id,
      name: u.profile?.real_name || u.name,
      email: u.profile?.email || null,
      is_admin: u.is_admin || false,
      is_owner: u.is_owner || false,
      is_bot: u.is_bot || false,
      deleted: u.deleted || false,
    })).filter((u: any) => !u.deleted && !u.is_bot)
    return jsonResponse({ success: true, users })
  } catch (error: any) {
    return jsonResponse({ success: false, error: error.message }, { status: 500 })
  }
} 