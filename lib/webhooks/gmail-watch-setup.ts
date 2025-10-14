/**
 * ⚠️ DEPRECATED FILE (2025-10-03)
 *
 * This file is deprecated and should no longer be used for new code.
 *
 * REASON: Gmail triggers now use the unified TriggerLifecycleManager system
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
import { GmailService } from '@/lib/integrations/gmail'
import { decryptToken } from '@/lib/integrations/tokenUtils'

import { logger } from '@/lib/utils/logger'

interface GmailWatchConfig {
  userId: string
  integrationId: string
  topicName: string
  labelIds?: string[]
}

export interface GmailWatchResult {
  historyId: string
  emailAddress: string
  expiration: string
}

/**
 * @deprecated Use GoogleApisTriggerLifecycle instead
 * Set up Gmail watch for push notifications
 * Gmail watches expire after 7 days and need to be renewed
 */
export async function setupGmailWatch(config: GmailWatchConfig): Promise<GmailWatchResult> {
  logger.warn('⚠️ DEPRECATED: setupGmailWatch() is deprecated. Use GoogleApisTriggerLifecycle instead.')
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

    // Decrypt the access token
    const decryptedAccessToken = await decryptToken(integration.access_token)
    if (!decryptedAccessToken) {
      throw new Error('Failed to decrypt Gmail access token')
    }

    // Check if token needs refresh
    let accessToken = decryptedAccessToken
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      logger.debug('Access token expired, refreshing...')
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

    const profile = await gmail.users.getProfile({ userId: 'me' })

    const expirationIso = new Date(parseInt(response.data.expiration)).toISOString()

    logger.debug('✅ Gmail watch created successfully:', {
      historyId: response.data.historyId,
      expiration: expirationIso,
      emailAddress: profile.data.emailAddress
    })

    // Gmail doesn't provide a channel ID or resource ID like other Google services
    // We'll use the history ID as a unique identifier
    const channelId = `gmail-${config.userId}-${Date.now()}`

    // Store the watch details in database for renewal
    await supabase.from('google_watch_subscriptions').upsert({
      user_id: config.userId,
      integration_id: config.integrationId,
      provider: 'gmail',
      channel_id: channelId,
      resource_id: response.data.historyId, // Use history ID as resource ID
      expiration: new Date(parseInt(response.data.expiration)).toISOString(),
      metadata: {
        topicName: config.topicName,
        labelIds: config.labelIds || ['INBOX'],
        historyId: response.data.historyId,
        emailAddress: profile.data.emailAddress
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    return {
      historyId: response.data.historyId,
      emailAddress: profile.data.emailAddress || '',
      expiration: expirationIso
    }
  } catch (error) {
    logger.error('Failed to set up Gmail watch:', error)
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
      logger.debug('Gmail integration not found - watch may already be stopped')
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
      logger.debug('Failed to decrypt Gmail access token - watch may already be stopped')
      return
    }
    oauth2Client.setCredentials({ access_token: decryptedAccessToken })

    // Create Gmail client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    await gmail.users.stop({
      userId: 'me'
    })

    // Remove from database
    await supabase
      .from('google_watch_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('integration_id', integrationId)
      .eq('provider', 'gmail')

    logger.debug('✅ Gmail watch stopped successfully')
  } catch (error) {
    logger.error('Failed to stop Gmail watch:', error)
    // Don't throw - watch might already be stopped
  }
}
