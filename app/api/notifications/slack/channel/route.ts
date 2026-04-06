import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * PUT /api/notifications/slack/channel
 * Updates the Slack channel for notifications.
 * No new OAuth needed — uses the existing bot token.
 */
export async function PUT(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return errorResponse("Not authenticated", 401)

    const body = await request.json()
    const { channel_id } = body

    if (!channel_id || typeof channel_id !== 'string') {
      return errorResponse("Invalid channel_id", 400)
    }

    // Fetch current config
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('slack_notification_config')
      .eq('id', user.id)
      .single()

    if (fetchError || !profile?.slack_notification_config) {
      return errorResponse("Slack is not connected", 400)
    }

    const config = profile.slack_notification_config
    const channel = config.channels?.find((ch: any) => ch.id === channel_id)

    // Update the channel in config
    const updatedConfig = {
      ...config,
      channel_id,
      channel_name: channel?.name || null,
    }

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ slack_notification_config: updatedConfig })
      .eq('id', user.id)

    if (updateError) {
      logger.error('[SlackChannel] Failed to update', { error: updateError.message })
      return errorResponse("Failed to update channel", 500)
    }

    return jsonResponse({ success: true, channel_name: channel?.name })
  } catch (error: any) {
    logger.error('[SlackChannel] Unexpected error', { error: error.message })
    return errorResponse("Failed to update channel", 500)
  }
}
