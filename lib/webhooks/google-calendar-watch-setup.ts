import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/integrations/tokenUtils'

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

    // Generate a unique channel ID
    const channelId = `calendar-${config.userId}-${calendarId}-${Date.now()}`

    // Calculate expiration (maximum 1 week from now)
    const expiration = new Date()
    expiration.setDate(expiration.getDate() + 7)

    // Set up the webhook channel
    const watchResponse = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/google/calendar`,
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

    // Store the watch details in database for renewal
    await supabase.from('google_watch_subscriptions').upsert({
      user_id: config.userId,
      integration_id: config.integrationId,
      provider: 'google-calendar',
      channel_id: channelId,
      resource_id: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      sync_token: syncToken,
      metadata: {
        calendarId,
        eventTypes: config.eventTypes
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    return {
      channelId,
      resourceId: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      syncToken
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
export async function getGoogleCalendarChanges(userId: string, integrationId: string, calendarId: string, syncToken?: string) {
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

    // Get events with sync token for incremental updates
    const params: any = {
      calendarId: calendarId || 'primary',
      showDeleted: true,
      singleEvents: true
    }

    if (syncToken) {
      params.syncToken = syncToken
    } else {
      // If no sync token, get events from the last 7 days
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      params.timeMin = oneWeekAgo.toISOString()
      params.maxResults = 100
    }

    const response = await calendar.events.list(params)

    return {
      events: response.data.items,
      nextSyncToken: response.data.nextSyncToken,
      nextPageToken: response.data.nextPageToken
    }
  } catch (error) {
    console.error('Failed to get Google Calendar changes:', error)
    throw error
  }
}