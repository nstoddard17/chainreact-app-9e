/**
 * Integration Notification Service
 *
 * Sends notifications to users about integration status changes:
 * - Connection warnings (temporary failures)
 * - Disconnection alerts (permanent failures)
 * - Rate limit notifications
 *
 * Supports both in-app and email notifications with escalation logic.
 */

import { logger } from '@/lib/utils/logger'

export interface NotificationOptions {
  userId: string
  provider: string
  integrationId: string
  notificationType: 'warning' | 'disconnected' | 'rate_limit'
  consecutiveFailures?: number
  consecutiveTransientFailures?: number
  errorMessage?: string
  sendEmail?: boolean
}

/**
 * Get provider display name (capitalize and format nicely)
 */
function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    'hubspot': 'HubSpot',
    'google-sheets': 'Google Sheets',
    'google-drive': 'Google Drive',
    'google-calendar': 'Google Calendar',
    'microsoft-outlook': 'Microsoft Outlook',
    'microsoft-onenote': 'Microsoft OneNote',
    'onedrive': 'OneDrive',
    'gmail': 'Gmail',
    'slack': 'Slack',
    'discord': 'Discord',
    'trello': 'Trello',
    'notion': 'Notion',
    'airtable': 'Airtable',
    'stripe': 'Stripe',
    'github': 'GitHub',
    'linkedin': 'LinkedIn',
    'facebook': 'Facebook',
    'twitter': 'Twitter',
    'instagram': 'Instagram',
  }

  return displayNames[provider.toLowerCase()] || provider.charAt(0).toUpperCase() + provider.slice(1)
}

/**
 * Create notification in database
 */
async function createNotification(
  supabase: any,
  userId: string,
  type: string,
  title: string,
  message: string,
  actionUrl: string,
  actionLabel: string,
  metadata: Record<string, any>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        action_url: actionUrl,
        action_label: actionLabel,
        metadata,
        is_read: false,
        created_at: new Date().toISOString()
      })

    if (error) {
      logger.error('[NotificationService] Failed to create notification:', error)
      return false
    }

    logger.debug('[NotificationService] Created notification:', { userId, type, title })
    return true
  } catch (error: any) {
    logger.error('[NotificationService] Error creating notification:', error)
    return false
  }
}

/**
 * Send email notification using Resend
 */
async function sendEmailNotification(
  supabase: any,
  userId: string,
  provider: string,
  providerName: string,
  subject: string,
  message: string,
  actionUrl: string,
  disconnectReason?: string,
  consecutiveFailures?: number
): Promise<boolean> {
  try {
    // Get user email and name from database
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('email, username')
      .eq('id', userId)
      .single()

    if (userError || !userData) {
      logger.error('[NotificationService] Failed to fetch user data:', userError)
      return false
    }

    // Import Resend service dynamically to avoid circular dependencies
    const { sendIntegrationDisconnectedEmail } = await import('@/lib/services/resend')

    // Send email using Resend
    const result = await sendIntegrationDisconnectedEmail(
      userData.email,
      userData.username || 'there',
      providerName,
      actionUrl,
      disconnectReason,
      consecutiveFailures
    )

    if (result.success) {
      logger.info('[NotificationService] Email sent successfully:', {
        userId,
        provider,
        emailId: result.id
      })
      return true
    } else {
      logger.error('[NotificationService] Failed to send email:', result.error)
      return false
    }
  } catch (error: any) {
    logger.error('[NotificationService] Error sending email:', error)
    return false
  }
}

/**
 * Send warning notification (2nd consecutive failure)
 */
export async function sendWarningNotification(
  supabase: any,
  options: NotificationOptions
): Promise<void> {
  const { userId, provider, integrationId, consecutiveFailures = 2, errorMessage } = options
  const providerName = getProviderDisplayName(provider)

  logger.info(`[NotificationService] Sending warning notification for ${provider}`, {
    userId,
    integrationId,
    consecutiveFailures
  })

  // In-app notification
  const title = `⚠️ ${providerName} Connection Issue`
  const message = `We're having trouble connecting to ${providerName}. Please check your connection to keep your workflows running.`
  const actionUrl = `/integrations?reconnect=${provider}`
  const actionLabel = 'Reconnect Now'

  await createNotification(
    supabase,
    userId,
    'integration_warning',
    title,
    message,
    actionUrl,
    actionLabel,
    {
      provider,
      integration_id: integrationId,
      consecutive_failures: consecutiveFailures,
      error_message: errorMessage,
      severity: 'warning'
    }
  )
}

/**
 * Send disconnection notification (3rd failure or invalid refresh token)
 */
export async function sendDisconnectionNotification(
  supabase: any,
  options: NotificationOptions
): Promise<void> {
  const { userId, provider, integrationId, consecutiveFailures = 3, errorMessage, sendEmail = true } = options
  const providerName = getProviderDisplayName(provider)

  logger.info(`[NotificationService] Sending disconnection notification for ${provider}`, {
    userId,
    integrationId,
    consecutiveFailures,
    sendEmail
  })

  // In-app notification
  const title = `🔴 ${providerName} Disconnected`
  const message = `Your ${providerName} connection has been disconnected. Your workflows are paused. Reconnect now to resume.`
  const actionUrl = `/integrations?reconnect=${provider}`
  const actionLabel = 'Reconnect Now'

  await createNotification(
    supabase,
    userId,
    'integration_disconnected',
    title,
    message,
    actionUrl,
    actionLabel,
    {
      provider,
      integration_id: integrationId,
      consecutive_failures: consecutiveFailures,
      error_message: errorMessage,
      severity: 'critical'
    }
  )

  // Send email if requested (on 2nd failure or permanent disconnection)
  if (sendEmail) {
    await sendEmailNotification(
      supabase,
      userId,
      provider,
      providerName,
      `${providerName} Integration Disconnected`,
      message,
      actionUrl,
      errorMessage,
      consecutiveFailures
    )
  }
}

/**
 * Send rate limit notification (5+ consecutive transient failures)
 */
export async function sendRateLimitNotification(
  supabase: any,
  options: NotificationOptions
): Promise<void> {
  const { userId, provider, integrationId, consecutiveTransientFailures = 5 } = options
  const providerName = getProviderDisplayName(provider)

  logger.info(`[NotificationService] Sending rate limit notification for ${provider}`, {
    userId,
    integrationId,
    consecutiveTransientFailures
  })

  // In-app notification only (informational, not urgent)
  const title = `ℹ️ ${providerName} Rate Limited`
  const message = `${providerName} is temporarily rate limiting requests. We'll automatically retry. Your workflows will continue once the limit resets.`
  const actionUrl = `/integrations`
  const actionLabel = 'View Integrations'

  await createNotification(
    supabase,
    userId,
    'integration_rate_limit',
    title,
    message,
    actionUrl,
    actionLabel,
    {
      provider,
      integration_id: integrationId,
      consecutive_transient_failures: consecutiveTransientFailures,
      severity: 'info'
    }
  )
}

/**
 * Determine if notification should be sent based on failure count
 */
export function shouldSendNotification(
  consecutiveFailures: number,
  consecutiveTransientFailures: number,
  notificationType: 'warning' | 'disconnected' | 'rate_limit'
): boolean {
  switch (notificationType) {
    case 'warning':
      // Send warning on 2nd consecutive auth failure
      return consecutiveFailures === 2

    case 'disconnected':
      // Send disconnection on 3rd consecutive auth failure or immediate permanent failure
      return consecutiveFailures >= 3

    case 'rate_limit':
      // Send rate limit info after 5+ consecutive transient failures
      return consecutiveTransientFailures >= 5 && consecutiveTransientFailures % 5 === 0

    default:
      return false
  }
}
