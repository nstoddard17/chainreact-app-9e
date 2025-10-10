/**
 * ⚠️ DEPRECATED FILE (2025-10-03)
 *
 * This file is deprecated and should no longer be used for new code.
 *
 * REASON: Google Drive triggers now use the unified TriggerLifecycleManager system
 * which provides proper workflow tracking and lifecycle management.
 *
 * OLD SYSTEM (this file):
 * - Stores subscriptions in google_watch_subscriptions table (no workflow_id tracking)
 * - Manual subscription management
 * - No integration with workflow activation/deactivation
 *
 * NEW SYSTEM (replacement):
 * - File: /lib/triggers/providers/GoogleApisTriggerLifecycle.ts
 * - Stores in: trigger_resources table (with workflow_id tracking)
 * - Automatic lifecycle: create on activate, delete on deactivate
 * - Unified management via TriggerLifecycleManager
 *
 * MIGRATION PATH:
 * - New workflows automatically use new system
 * - This file kept for backward compatibility only
 * - Will be removed after all existing subscriptions migrated
 *
 * SEE: /learning/docs/trigger-lifecycle-audit.md
 */

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/integrations/tokenUtils'

function getGoogleWebhookCallbackUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production'
  const baseUrl = isProduction
    ? process.env.NEXT_PUBLIC_APP_URL
    : process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL || process.env.NEXT_PUBLIC_APP_URL

  if (!baseUrl) {
    throw new Error('Missing webhook base URL. Set NEXT_PUBLIC_APP_URL (and NEXT_PUBLIC_WEBHOOK_HTTPS_URL in development).')
  }

  return `${baseUrl.replace(/\/$/, '')}/api/webhooks/google`
}

interface GoogleDriveWatchConfig {
  userId: string
  integrationId: string
  folderId?: string // Optional: watch specific folder, otherwise watch all changes
  includeRemoved?: boolean
  pageToken?: string // For resuming from a specific point
  contextProvider?: 'google-docs' | 'google-drive' | 'google-sheets'
}

/**
 * @deprecated Use GoogleApisTriggerLifecycle instead
 * Set up Google Drive watch for push notifications
 * Drive watches don't expire like Gmail (they're based on changes.watch)
 */
export async function setupGoogleDriveWatch(config: GoogleDriveWatchConfig): Promise<{ channelId: string; resourceId: string; expiration: string }> {
  console.warn('⚠️ DEPRECATED: setupGoogleDriveWatch() is deprecated. Use GoogleApisTriggerLifecycle instead.')
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
      .eq('provider', 'google-drive')
      .single()

    if (error || !integration) {
      throw new Error('Google Drive integration not found')
    }

    // Decrypt the access token
    const decryptedAccessToken = await decryptToken(integration.access_token)
    if (!decryptedAccessToken) {
      throw new Error('Failed to decrypt Google Drive access token')
    }

    // Check if token needs refresh
    const accessToken = decryptedAccessToken
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      console.log('Access token expired, refreshing...')
      // TODO: Implement token refresh for Google Drive
      // For now, throw an error
      throw new Error('Google Drive token expired - please reconnect the integration')
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create Drive client
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Get the starting page token for changes
    let startPageToken = config.pageToken
    if (!startPageToken) {
      const tokenResponse = await drive.changes.getStartPageToken({
        supportsAllDrives: true,
        supportsTeamDrives: true
      })
      startPageToken = tokenResponse.data.startPageToken!
    }

    // Generate a unique channel ID
    const channelId = `drive-${config.userId}-${Date.now()}`

    // Calculate expiration (maximum 1 week from now)
    const expiration = new Date()
    expiration.setDate(expiration.getDate() + 7)

    // Set up the webhook channel
    const watchResponse = await drive.changes.watch({
      pageToken: startPageToken,
      supportsAllDrives: true,
      supportsTeamDrives: true,
      includeRemoved: config.includeRemoved || false,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: getGoogleWebhookCallbackUrl(),
        expiration: expiration.getTime().toString(),
        // If watching a specific folder, add it to the token
        token: JSON.stringify({
          userId: config.userId,
          integrationId: config.integrationId,
          provider: config.contextProvider || 'google-drive',
          via: 'drive-changes',
          folderId: config.folderId || null
        })
      }
    })

    if (!watchResponse.data.resourceId || !watchResponse.data.expiration) {
      throw new Error('Failed to create Google Drive watch - missing required data')
    }

    console.log(`✅ ${(config.contextProvider === 'google-docs') ? 'Google Docs (via Drive)' : 'Google Drive'} watch created successfully:`, {
      channelId,
      resourceId: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString()
    })

    // Store the watch details in database for renewal
    await supabase.from('google_watch_subscriptions').upsert({
      user_id: config.userId,
      integration_id: config.integrationId,
      provider: 'google-drive',
      channel_id: channelId,
      resource_id: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString(),
      page_token: startPageToken,
      metadata: {
        folderId: config.folderId,
        includeRemoved: config.includeRemoved
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    return {
      channelId,
      resourceId: watchResponse.data.resourceId,
      expiration: new Date(parseInt(watchResponse.data.expiration)).toISOString()
    }
  } catch (error) {
    console.error('Failed to set up Google Drive watch:', error)
    throw error
  }
}

/**
 * @deprecated Use GoogleApisTriggerLifecycle instead
 * Stop Google Drive watch
 */
export async function stopGoogleDriveWatch(userId: string, integrationId: string, channelId: string, resourceId: string): Promise<void> {
  console.warn('⚠️ DEPRECATED: stopGoogleDriveWatch() is deprecated. Use GoogleApisTriggerLifecycle instead.')
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
      .eq('provider', 'google-drive')
      .single()

    if (error || !integration) {
      console.log('Google Drive integration not found - watch may already be stopped')
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
      console.log('Failed to decrypt Google Drive access token - watch may already be stopped')
      return
    }
    oauth2Client.setCredentials({ access_token: decryptedAccessToken })

    // Create Drive client
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Stop the watch
    await drive.channels.stop({
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

    console.log('✅ Google Drive watch stopped successfully')
  } catch (error) {
    console.error('Failed to stop Google Drive watch:', error)
    // Don't throw - watch might already be stopped
  }
}

/**
 * List file changes since last check
 */
export async function getGoogleDriveChanges(
  userId: string,
  integrationId: string,
  pageToken: string,
  provider: 'google-drive' | 'google-sheets' = 'google-drive'
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
      .eq('provider', provider)
      .single()

    if (error || !integration) {
      throw new Error(`${provider === 'google-sheets' ? 'Google Sheets' : 'Google Drive'} integration not found`)
    }

    // Decrypt and set up OAuth
    const decryptedAccessToken = await decryptToken(integration.access_token)
    if (!decryptedAccessToken) {
      throw new Error('Failed to decrypt Google Drive access token')
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    oauth2Client.setCredentials({ access_token: decryptedAccessToken })

    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Get the changes
    const response = await drive.changes.list({
      pageToken,
      includeRemoved: true,
      supportsAllDrives: true,
      supportsTeamDrives: true,
      // Include createdTime so we can classify true creations reliably
      fields: 'changes(file(id,name,mimeType,createdTime,modifiedTime,parents),fileId,removed,type),newStartPageToken,nextPageToken'
    })

    return {
      changes: response.data.changes,
      nextPageToken: response.data.nextPageToken || response.data.newStartPageToken
    }
  } catch (error) {
    console.error('Failed to get Google Drive changes:', error)
    throw error
  }
}
