import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/integrations/tokenUtils'
import crypto from 'crypto'

function getGoogleWebhookCallbackUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production'
  const baseUrl = isProduction
    ? process.env.NEXT_PUBLIC_APP_URL
    : process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL || process.env.NEXT_PUBLIC_APP_URL

  if (!baseUrl) {
    throw new Error('Missing webhook base URL. Set NEXT_PUBLIC_APP_URL (and NEXT_PUBLIC_WEBHOOK_HTTPS_URL in development).')
  }

  const resolved = `${baseUrl.replace(/\/$/, '')}/api/webhooks/google`
  try {
    const usedVar = isProduction
      ? 'NEXT_PUBLIC_APP_URL'
      : (process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL ? 'NEXT_PUBLIC_WEBHOOK_HTTPS_URL' : 'NEXT_PUBLIC_APP_URL')
    console.log('🪝 Resolved Google webhook callback URL', {
      env: isProduction ? 'production' : 'development',
      usedVar,
      baseUrl,
      callbackUrl: resolved
    })
  } catch {}
  return resolved
}

interface GoogleCalendarWatchConfig {
  userId: string
  integrationId: string
  calendarId?: string // Specific calendar to watch, defaults to 'primary'
  eventTypes?: string[] // Types of events to watch for
  syncToken?: string // For incremental sync
}

/**
 * Set up Google Calendar watch for push notifications
 * Calendar watches expire after a maximum of 1 week
 */
export async function setupGoogleCalendarWatch(config: GoogleCalendarWatchConfig): Promise<{ channelId: string; resourceId: string; expiration: string; syncToken?: string }> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the integration to fetch access token
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('access_token, refresh_token, expires_at')
      .eq('id', config.integrationId)
      .eq('user_id', config.userId)
      .eq('provider', 'google-calendar')
      .single()

    if (error || !integration) {
      throw new Error('Google Calendar integration not found')
    }

    // Decrypt the access token
    const decryptedAccessToken = await decryptToken(integration.access_token)
    if (!decryptedAccessToken) {
      throw new Error('Failed to decrypt Google Calendar access token')
    }

    // Check if token needs refresh
    let accessToken = decryptedAccessToken
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      console.log('Access token expired, refreshing...')
      // TODO: Implement token refresh for Google Calendar
      // For now, throw an error
      throw new Error('Google Calendar token expired - please reconnect the integration')
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create Calendar client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Use primary calendar if not specified
    const calendarId = config.calendarId || 'primary'

    // Generate a unique channel ID that complies with Google requirements
    const randomSuffix = crypto.randomBytes(12).toString('base64url')
    const channelId = `cal-${randomSuffix}`.slice(0, 63)

    // Calculate expiration (maximum 1 week from now)
    const expiration = new Date()
    expiration.setDate(expiration.getDate() + 7)

    // Set up the webhook channel
    const registrationTimestamp = new Date().toISOString()

    const callbackUrl = getGoogleWebhookCallbackUrl()
    console.log('🔗 Setting up Google Calendar watch with callback URL:', callbackUrl)

    const watchResponse = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: callbackUrl,
        expiration: expiration.getTime().toString(),
        // Store metadata in token
        token: JSON.stringify({
          userId: config.userId,
          integrationId: config.integrationId,
          calendarId,
          eventTypes: config.eventTypes
        })
      }
    })

    if (!watchResponse.data.resourceId || !watchResponse.data.expiration) {
      throw new Error('Failed to create Google Calendar watch - missing required data')
    }

    // Get initial sync token for incremental updates
    let syncToken = config.syncToken
    if (!syncToken) {
      try {
        const eventsResponse = await calendar.events.list({
          calendarId,
          maxResults: 1,
          showDeleted: false,
          singleEvents: true
        })
        syncToken = eventsResponse.data.nextSyncToken
      } catch (err) {
        console.warn('Could not get initial sync token:', err)
      }
    }

    console.log('✅ Google Calendar watch created successfully:', {
      channelId,
      resourceId: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      calendarId
    })

    // Ensure only one active row exists per user/integration/provider
    await supabase
      .from('google_watch_subscriptions')
      .delete()
      .eq('user_id', config.userId)
      .eq('integration_id', config.integrationId)
      .eq('provider', 'google-calendar')

    // Store the watch details in database for renewal
    await supabase.from('google_watch_subscriptions').insert({
      user_id: config.userId,
      integration_id: config.integrationId,
      provider: 'google-calendar',
      channel_id: channelId,
      resource_id: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      sync_token: syncToken,
      metadata: {
        calendarId,
        eventTypes: config.eventTypes,
        startTime: registrationTimestamp,
        callbackUrl
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    return {
      channelId,
      resourceId: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      syncToken,
      startTime: registrationTimestamp
    }
  } catch (error) {
    console.error('Failed to set up Google Calendar watch:', error)
    throw error
  }
}

/**
 * Stop Google Calendar watch
 */
export async function stopGoogleCalendarWatch(userId: string, integrationId: string, channelId: string, resourceId: string): Promise<void> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the integration to fetch access token
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('id', integrationId)
      .eq('user_id', userId)
      .eq('provider', 'google-calendar')
      .single()

    if (error || !integration) {
      console.log('Google Calendar integration not found - watch may already be stopped')
      return
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    // Decrypt the access token first
    const decryptedAccessToken = await decryptToken(integration.access_token)
    if (!decryptedAccessToken) {
      console.log('Failed to decrypt Google Calendar access token - watch may already be stopped')
      return
    }
    oauth2Client.setCredentials({ access_token: decryptedAccessToken })

    // Create Calendar client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Stop the watch
    await calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId: resourceId
      }
    })

    // Remove from database
    await supabase
      .from('google_watch_subscriptions')
      .delete()
      .eq('channel_id', channelId)
      .eq('user_id', userId)

    console.log('✅ Google Calendar watch stopped successfully')
  } catch (error) {
    console.error('Failed to stop Google Calendar watch:', error)
    // Don't throw - watch might already be stopped
  }
}

/**
 * Get calendar events that have changed since last sync
 */
export async function getGoogleCalendarChanges(
  userId: string,
  integrationId: string,
  calendarId: string,
  syncToken?: string,
  options?: { timeMin?: string | null }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the integration to fetch access token
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('id', integrationId)
      .eq('user_id', userId)
      .eq('provider', 'google-calendar')
      .single()

    if (error || !integration) {
      throw new Error('Google Calendar integration not found')
    }

    // Decrypt and set up OAuth
    const decryptedAccessToken = await decryptToken(integration.access_token)
    if (!decryptedAccessToken) {
      throw new Error('Failed to decrypt Google Calendar access token')
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    oauth2Client.setCredentials({ access_token: decryptedAccessToken })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Build base params for events.list
    const baseParams: any = {
      calendarId: calendarId || 'primary',
      showDeleted: true,
      singleEvents: true
    }

    // If we already have a sync token, use it (incremental sync). Otherwise, only fetch
    // events that occurred after the webhook registration time if provided.
    if (syncToken) {
      baseParams.syncToken = syncToken
    } else {
      // On first fetch, use updatedMin so we only receive events that were
      // created or updated after the watch start time, preventing backfill
      const updatedMin = options?.timeMin || null
      baseParams.updatedMin = (typeof updatedMin === 'string' && updatedMin.trim().length > 0)
        ? updatedMin
        : new Date().toISOString()
      baseParams.maxResults = 250
    }

    // Handle pagination to ensure we process all changes in one go
    const allEvents: any[] = []
    let nextPageToken: string | undefined = undefined
    let nextSyncToken: string | undefined = undefined

    do {
      const params = { ...baseParams }
      if (nextPageToken) params.pageToken = nextPageToken

      const response = await calendar.events.list(params)
      const items = Array.isArray(response.data.items) ? response.data.items : []
      allEvents.push(...items)

      nextPageToken = response.data.nextPageToken || undefined
      // Google may only return nextSyncToken when pagination is complete
      if (response.data.nextSyncToken) {
        nextSyncToken = response.data.nextSyncToken
      }
    } while (nextPageToken)

    return {
      events: allEvents,
      nextSyncToken,
      nextPageToken: undefined
    }
  } catch (error) {
    console.error('Failed to get Google Calendar changes:', error)
    throw error
  }
}
