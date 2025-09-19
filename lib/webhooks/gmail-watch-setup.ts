import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { GmailService } from '@/lib/integrations/gmail'

interface GmailWatchConfig {
  userId: string
  integrationId: string
  topicName: string
  labelIds?: string[]
}

/**
 * Set up Gmail watch for push notifications
 * Gmail watches expire after 7 days and need to be renewed
 */
export async function setupGmailWatch(config: GmailWatchConfig): Promise<string> {
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
      .single()

    if (error || !integration) {
      throw new Error('Gmail integration not found')
    }

    // Check if token needs refresh
    let accessToken = integration.access_token
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      console.log('Access token expired, refreshing...')
      const newToken = await GmailService.refreshToken(config.userId, config.integrationId)
      if (!newToken) {
        throw new Error('Failed to refresh Gmail access token')
      }
      accessToken = newToken
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create Gmail client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Set up watch request
    const watchRequest = {
      userId: 'me',
      requestBody: {
        topicName: config.topicName,
        labelIds: config.labelIds || ['INBOX'],
        labelFilterAction: 'include'
      }
    }

    // Create the watch
    const response = await gmail.users.watch(watchRequest)

    if (!response.data.historyId || !response.data.expiration) {
      throw new Error('Failed to create Gmail watch - missing required data')
    }

    console.log('✅ Gmail watch created successfully:', {
      historyId: response.data.historyId,
      expiration: new Date(parseInt(response.data.expiration)).toISOString()
    })

    // Return the history ID for tracking changes
    return response.data.historyId
  } catch (error) {
    console.error('Failed to set up Gmail watch:', error)
    throw error
  }
}

/**
 * Stop Gmail watch
 */
export async function stopGmailWatch(userId: string, integrationId: string): Promise<void> {
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
      .single()

    if (error || !integration) {
      console.log('Gmail integration not found - watch may already be stopped')
      return
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    oauth2Client.setCredentials({ access_token: integration.access_token })

    // Create Gmail client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    await gmail.users.stop({
      userId: 'me'
    })

    console.log('✅ Gmail watch stopped successfully')
  } catch (error) {
    console.error('Failed to stop Gmail watch:', error)
    // Don't throw - watch might already be stopped
  }
}