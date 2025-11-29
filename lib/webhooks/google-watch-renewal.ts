import { createClient } from '@supabase/supabase-js'
import { setupGmailWatch, stopGmailWatch } from './gmail-watch-setup'
import { setupGoogleDriveWatch, stopGoogleDriveWatch } from './google-drive-watch-setup'
import { setupGoogleCalendarWatch, stopGoogleCalendarWatch } from './google-calendar-watch-setup'
import { setupGoogleSheetsWatch, stopGoogleSheetsWatch } from './google-sheets-watch-setup'

import { logger } from '@/lib/utils/logger'

/**
 * Renew Google watches that are about to expire
 * Google watches expire after 7 days maximum, so we need to renew them before expiration
 * This should be run as a scheduled job (e.g., every 6 days)
 */
export async function renewExpiringGoogleWatches(): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  try {
    // Get all webhook subscriptions that expire within the next 24 hours
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { data: expiringSubscriptions, error } = await supabase
      .from('google_watch_subscriptions')
      .select('*')
      .in('provider', ['gmail', 'google-drive', 'google-calendar', 'google-sheets'])
      .lte('expiration', tomorrow.toISOString())
      .order('expiration', { ascending: true })

    if (error) {
      logger.error('Failed to fetch expiring subscriptions:', error)
      return
    }

    if (!expiringSubscriptions || expiringSubscriptions.length === 0) {
      logger.debug('No Google watches expiring soon')
      return
    }

    logger.debug(`Found ${expiringSubscriptions.length} Google watches expiring soon`)

    // Process each expiring subscription
    for (const subscription of expiringSubscriptions) {
      try {
        logger.debug(`Renewing ${subscription.provider} watch for user ${subscription.user_id}`)

        switch (subscription.provider) {
          case 'gmail':
            await renewGmailWatch(subscription)
            break
          case 'google-drive':
            await renewGoogleDriveWatch(subscription)
            break
          case 'google-calendar':
            await renewGoogleCalendarWatch(subscription)
            break
          case 'google-sheets':
            await renewGoogleSheetsWatch(subscription)
            break
        }

        logger.debug(`✅ Successfully renewed ${subscription.provider} watch`)
      } catch (error) {
        logger.error(`Failed to renew ${subscription.provider} watch:`, error)

        // Log the failure
        await supabase
          .from('google_watch_renewal_failures')
          .insert({
            subscription_id: subscription.id,
            provider: subscription.provider,
            user_id: subscription.user_id,
            error_message: error instanceof Error ? error.message : 'Unknown error',
            failed_at: new Date().toISOString()
          })
      }
    }
  } catch (error) {
    logger.error('Failed to renew expiring Google watches:', error)
  }
}

/**
 * Renew Gmail watch
 */
async function renewGmailWatch(subscription: any): Promise<void> {
  // Stop the old watch
  try {
    await stopGmailWatch(subscription.user_id, subscription.integration_id)
  } catch (error) {
    logger.debug('Could not stop old Gmail watch (may already be expired):', error)
  }

  // Create a new watch
  const metadata = subscription.metadata || {}
  const watchResult = await setupGmailWatch({
    userId: subscription.user_id,
    integrationId: subscription.integration_id,
    topicName: metadata.topicName || process.env.GMAIL_PUBSUB_TOPIC!,
    labelIds: metadata.labelIds || ['INBOX']
  })

  // Update the subscription with new expiration
  const newExpiration = watchResult.expiration ? new Date(watchResult.expiration) : (() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date;
  })()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  await supabase
    .from('google_watch_subscriptions')
    .update({
      expiration: newExpiration.toISOString(),
      metadata: {
        ...metadata,
        historyId: watchResult.historyId,
        emailAddress: watchResult.emailAddress,
        renewedAt: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', subscription.id)
}

/**
 * Renew Google Drive watch
 */
async function renewGoogleDriveWatch(subscription: any): Promise<void> {
  // Stop the old watch
  try {
    await stopGoogleDriveWatch(
      subscription.user_id,
      subscription.integration_id,
      subscription.channel_id,
      subscription.resource_id
    )
  } catch (error) {
    logger.debug('Could not stop old Drive watch (may already be expired):', error)
  }

  // Create a new watch
  const metadata = subscription.metadata || {}
  const result = await setupGoogleDriveWatch({
    userId: subscription.user_id,
    integrationId: subscription.integration_id,
    folderId: metadata.folderId,
    includeRemoved: metadata.includeRemoved,
    pageToken: subscription.page_token
  })

  // The new subscription is automatically created by setupGoogleDriveWatch
  // Just log the renewal
  logger.debug(`Google Drive watch renewed with new channel ID: ${result.channelId}`)
}

/**
 * Renew Google Calendar watch
 */
async function renewGoogleCalendarWatch(subscription: any): Promise<void> {
  // Stop the old watch
  try {
    await stopGoogleCalendarWatch(
      subscription.user_id,
      subscription.integration_id,
      subscription.channel_id,
      subscription.resource_id
    )
  } catch (error) {
    logger.debug('Could not stop old Calendar watch (may already be expired):', error)
  }

  // Create a new watch
  const metadata = subscription.metadata || {}
  const result = await setupGoogleCalendarWatch({
    userId: subscription.user_id,
    integrationId: subscription.integration_id,
    calendarId: metadata.calendarId || 'primary',
    eventTypes: metadata.eventTypes,
    syncToken: subscription.sync_token
  })

  // The new subscription is automatically created by setupGoogleCalendarWatch
  // Just log the renewal
  logger.debug(`Google Calendar watch renewed with new channel ID: ${result.channelId}`)
}

/**
 * Renew Google Sheets watch
 */
async function renewGoogleSheetsWatch(subscription: any): Promise<void> {
  // Stop the old watch
  try {
    await stopGoogleSheetsWatch(
      subscription.user_id,
      subscription.integration_id,
      subscription.channel_id,
      subscription.resource_id
    )
  } catch (error) {
    logger.debug('Could not stop old Sheets watch (may already be expired):', error)
  }

  // Create a new watch
  const metadata = subscription.metadata || {}
  const result = await setupGoogleSheetsWatch({
    userId: subscription.user_id,
    integrationId: subscription.integration_id,
    spreadsheetId: metadata.spreadsheetId,
    sheetName: metadata.sheetName,
    triggerType: metadata.triggerType || 'new_row'
  })

  // The new subscription is automatically created by setupGoogleSheetsWatch
  // Just log the renewal
  logger.debug(`Google Sheets watch renewed with new channel ID: ${result.channelId}`)
}

/**
 * Clean up expired subscriptions
 */
export async function cleanupExpiredSubscriptions(): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  try {
    // Delete subscriptions that expired more than 7 days ago
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const { data: deleted, error } = await supabase
      .from('google_watch_subscriptions')
      .delete()
      .lt('expiration', weekAgo.toISOString())
      .select()

    if (error) {
      logger.error('Failed to cleanup expired subscriptions:', error)
      return
    }

    if (deleted && deleted.length > 0) {
      logger.debug(`Cleaned up ${deleted.length} expired webhook subscriptions`)
    }
  } catch (error) {
    logger.error('Failed to cleanup expired subscriptions:', error)
  }
}
