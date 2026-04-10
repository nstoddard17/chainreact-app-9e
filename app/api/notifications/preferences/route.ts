import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * GET /api/notifications/preferences
 * Returns the user's notification preferences and Slack connection status.
 */
export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return errorResponse("Not authenticated", 401)

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('notification_preferences, slack_notification_config')
      .eq('id', user.id)
      .single()

    if (error) {
      logger.error('[NotificationPrefs] Failed to fetch', { error: error.message })
      return errorResponse("Failed to fetch preferences", 500)
    }

    const preferences = profile?.notification_preferences || {
      email: false,
      slack: false,
      workflow_success: true,
      workflow_failure: true,
      weekly_digest: false,
    }

    const slackConfig = profile?.slack_notification_config
    const slack = slackConfig ? {
      connected: true,
      team_name: slackConfig.team_name || null,
      channel_id: slackConfig.channel_id || null,
      channel_name: slackConfig.channel_name || null,
      channels: slackConfig.channels || [],
    } : { connected: false }

    return jsonResponse({ preferences, slack })
  } catch (error: any) {
    logger.error('[NotificationPrefs] Unexpected error', { error: error.message })
    return errorResponse("Failed to fetch preferences", 500)
  }
}

/**
 * PUT /api/notifications/preferences
 * Saves the user's notification toggle preferences.
 */
export async function PUT(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return errorResponse("Not authenticated", 401)

    const body = await request.json()
    const { preferences } = body

    if (!preferences || typeof preferences !== 'object') {
      return errorResponse("Invalid preferences", 400)
    }

    // Only allow known preference keys
    const allowed = ['email', 'slack', 'workflow_success', 'workflow_failure', 'weekly_digest']
    const sanitized: Record<string, boolean> = {}
    for (const key of allowed) {
      if (key in preferences) {
        sanitized[key] = Boolean(preferences[key])
      }
    }

    const { error } = await supabase
      .from('user_profiles')
      .update({ notification_preferences: sanitized })
      .eq('id', user.id)

    if (error) {
      logger.error('[NotificationPrefs] Failed to save', { error: error.message })
      return errorResponse("Failed to save preferences", 500)
    }

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error('[NotificationPrefs] Unexpected error', { error: error.message })
    return errorResponse("Failed to save preferences", 500)
  }
}
