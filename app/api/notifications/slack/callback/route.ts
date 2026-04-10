import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'

/**
 * GET /api/notifications/slack/callback
 * Handles the OAuth callback from Slack for notification connection.
 * Exchanges the code for a bot token, fetches channels, and stores config.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const baseUrl = getBaseUrl()
  const settingsUrl = `${baseUrl}/settings`

  if (error) {
    logger.error('[SlackNotifCallback] OAuth error', { error })
    return NextResponse.redirect(`${settingsUrl}?slack_error=denied`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?slack_error=missing_params`)
  }

  try {
    // Decode state to get user ID
    const stateData = JSON.parse(Buffer.from(state, 'base64url').toString())
    const userId = stateData.user_id

    if (!userId) {
      return NextResponse.redirect(`${settingsUrl}?slack_error=invalid_state`)
    }

    const clientId = process.env.SLACK_CLIENT_ID
    const clientSecret = process.env.SLACK_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      logger.error('[SlackNotifCallback] Missing Slack credentials')
      return NextResponse.redirect(`${settingsUrl}?slack_error=config`)
    }

    const redirectUri = `${baseUrl}/api/notifications/slack/callback`

    // Exchange code for token
    const tokenResponse = await fetchWithTimeout('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenData.ok) {
      logger.error('[SlackNotifCallback] Token exchange failed', { error: tokenData.error })
      return NextResponse.redirect(`${settingsUrl}?slack_error=token_failed`)
    }

    const botToken = tokenData.access_token
    const teamName = tokenData.team?.name || 'Slack Workspace'
    const teamId = tokenData.team?.id

    // Fetch channels list using the bot token
    const channelsResponse = await fetchWithTimeout('https://slack.com/api/conversations.list?types=public_channel&limit=200&exclude_archived=true', {
      headers: { 'Authorization': `Bearer ${botToken}` },
    })

    const channelsData = await channelsResponse.json()
    const channels = channelsData.ok
      ? (channelsData.channels || [])
          .filter((ch: any) => !ch.is_archived)
          .map((ch: any) => ({ id: ch.id, name: ch.name }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name))
      : []

    // Find #general or first channel as default
    const defaultChannel = channels.find((ch: any) => ch.name === 'general') || channels[0]

    // Store the Slack config
    const supabase = await createSupabaseRouteHandlerClient()

    const slackConfig = {
      bot_token: botToken,
      team_id: teamId,
      team_name: teamName,
      channel_id: defaultChannel?.id || null,
      channel_name: defaultChannel?.name || null,
      channels,
    }

    // Update both slack config and notification preferences
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .single()

    const prefs = { ...(profile?.notification_preferences || {}), slack: true }

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        slack_notification_config: slackConfig,
        notification_preferences: prefs,
      })
      .eq('id', userId)

    if (updateError) {
      logger.error('[SlackNotifCallback] Failed to save config', { error: updateError.message })
      return NextResponse.redirect(`${settingsUrl}?slack_error=save_failed`)
    }

    logger.info('[SlackNotifCallback] Slack connected for notifications', { userId, teamName })
    return NextResponse.redirect(`${settingsUrl}?slack_connected=true`)
  } catch (err: any) {
    logger.error('[SlackNotifCallback] Unexpected error', { error: err.message })
    return NextResponse.redirect(`${settingsUrl}?slack_error=unexpected`)
  }
}
