import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

/**
 * GET /api/notifications/slack/connect
 * Returns the Slack OAuth URL for notification connection.
 * Uses bot scopes needed for posting messages and listing channels.
 */
export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return errorResponse("Not authenticated", 401)

    const clientId = process.env.SLACK_CLIENT_ID
    if (!clientId) {
      logger.error('[SlackNotif] SLACK_CLIENT_ID not configured')
      return errorResponse("Slack is not configured", 500)
    }

    const baseUrl = getBaseUrl()
    const redirectUri = `${baseUrl}/api/notifications/slack/callback`
    const scopes = 'chat:write,channels:read,groups:read'
    const state = Buffer.from(JSON.stringify({ user_id: user.id, type: 'notification' })).toString('base64url')

    const url = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`

    return jsonResponse({ url })
  } catch (error: any) {
    logger.error('[SlackNotif] Connect error', { error: error.message })
    return errorResponse("Failed to generate Slack connect URL", 500)
  }
}

/**
 * DELETE /api/notifications/slack/connect
 * Disconnects Slack notifications for the user.
 */
export async function DELETE() {
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return errorResponse("Not authenticated", 401)

    const { error } = await supabase
      .from('user_profiles')
      .update({
        slack_notification_config: null,
        notification_preferences: supabase.rpc ? undefined : undefined, // Keep existing prefs, just clear slack config
      })
      .eq('id', user.id)

    if (error) {
      logger.error('[SlackNotif] Disconnect error', { error: error.message })
      return errorResponse("Failed to disconnect Slack", 500)
    }

    // Also update notification_preferences to set slack: false
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('notification_preferences')
      .eq('id', user.id)
      .single()

    if (profile?.notification_preferences) {
      const prefs = { ...profile.notification_preferences, slack: false }
      await supabase
        .from('user_profiles')
        .update({ notification_preferences: prefs })
        .eq('id', user.id)
    }

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error('[SlackNotif] Disconnect error', { error: error.message })
    return errorResponse("Failed to disconnect Slack", 500)
  }
}
