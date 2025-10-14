import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

/**
 * Trigger-specific metadata for filtering logic
 * Defines which filters apply to each trigger type for easy expansion
 */
interface TriggerFilterConfig {
  supportsFolder: boolean; // Does this trigger support folder filtering?
  supportsSender: boolean; // Does this trigger filter by sender (from)?
  supportsRecipient: boolean; // Does this trigger filter by recipient (to)?
  supportsSubject: boolean; // Does this trigger filter by subject?
  supportsImportance: boolean; // Does this trigger filter by importance?
  supportsAttachment: boolean; // Does this trigger filter by attachment?
  defaultFolder?: string; // Default folder if not specified (e.g., 'inbox', 'sentitems')
}

const TRIGGER_FILTER_CONFIG: Record<string, TriggerFilterConfig> = {
  // New Email trigger - monitors Inbox (or custom folder), filters by sender
  'microsoft-outlook_trigger_new_email': {
    supportsFolder: true,
    supportsSender: true,
    supportsRecipient: false,
    supportsSubject: true,
    supportsImportance: true,
    supportsAttachment: true,
    defaultFolder: 'inbox'
  },
  // Email Sent trigger - monitors Sent Items only, filters by recipient
  'microsoft-outlook_trigger_email_sent': {
    supportsFolder: false, // Subscription already scoped to Sent Items
    supportsSender: false,
    supportsRecipient: true,
    supportsSubject: true,
    supportsImportance: false,
    supportsAttachment: false,
    defaultFolder: 'sentitems'
  },
  // Email Received trigger (alias for new_email)
  'microsoft-outlook_trigger_email_received': {
    supportsFolder: true,
    supportsSender: true,
    supportsRecipient: false,
    supportsSubject: true,
    supportsImportance: true,
    supportsAttachment: true,
    defaultFolder: 'inbox'
  }
  // OneNote triggers removed - doesn't support webhooks (API deprecated May 2023)
  // Future triggers can be added here:
  // 'microsoft-outlook_trigger_email_draft': { ... }
  // 'microsoft-outlook_trigger_email_deleted': { ... }
  // 'microsoft-outlook_trigger_email_flagged': { ... }
}

// Helper function - hoisted above POST handler to avoid TDZ
// SECURITY: Logs webhook metadata only, not full payload (contains PII)
async function logWebhookExecution(
  provider: string,
  payload: any,
  headers: any,
  status: string,
  executionTime: number
): Promise<void> {
  try {
    // Don't log full payload - contains PII and resource IDs
    const safePayload = {
      hasValue: !!payload?.value,
      notificationCount: Array.isArray(payload?.value) ? payload.value.length : 0,
      payloadKeys: payload ? Object.keys(payload) : []
    }

    await supabase
      .from('webhook_logs')
      .insert({
        provider: provider,
        payload: safePayload, // Sanitized payload
        headers: { 'content-type': headers['content-type'] }, // Only log content type
        status: status,
        execution_time: executionTime,
        timestamp: new Date().toISOString()
      })
  } catch (error) {
    logger.error('Failed to log webhook execution:', error)
  }
}

// Helper function - process notifications async
async function processNotifications(
  notifications: any[],
  headers: any,
  requestId: string | undefined
): Promise<void> {
  for (const change of notifications) {
    try {
      // SECURITY: Don't log full resource data (contains PII/IDs)
      logger.debug('🔍 Processing notification:', {
        subscriptionId: change?.subscriptionId,
        changeType: change?.changeType,
        resourceType: change?.resourceData?.['@odata.type'],
        hasResource: !!change?.resource,
        hasClientState: !!change?.clientState
      })
      const subId: string | undefined = change?.subscriptionId
      const changeType: string | undefined = change?.changeType
      const resource: string | undefined = change?.resource
      const bodyClientState: string | undefined = change?.clientState

      // Resolve user and verify clientState from trigger_resources
      let userId: string | null = null
      let workflowId: string | null = null
      let triggerResourceId: string | null = null
      let configuredChangeType: string | null = null
      let triggerConfig: any = null
      if (subId) {
        logger.debug('🔍 Looking up subscription:', subId)

        const { data: triggerResource, error: resourceError } = await supabase
          .from('trigger_resources')
          .select('id, user_id, workflow_id, trigger_type, config')
          .eq('external_id', subId)
          .eq('resource_type', 'subscription')
          .like('provider_id', 'microsoft%')
          .maybeSingle()

        if (!triggerResource) {
          logger.warn('⚠️ Subscription not found in trigger_resources (likely old/orphaned subscription):', {
            subId,
            message: 'This subscription is not tracked in trigger_resources. Deactivate/reactivate workflow to clean up.'
          })
          continue
        }

        userId = triggerResource.user_id
        workflowId = triggerResource.workflow_id
        triggerResourceId = triggerResource.id
        const triggerType = triggerResource.trigger_type
        configuredChangeType = triggerResource.config?.changeType || null
        triggerConfig = triggerResource.config || null

        // Verify clientState if present
        if (bodyClientState && triggerResource.config?.clientState) {
          if (bodyClientState !== triggerResource.config.clientState) {
            logger.warn('⚠️ Invalid clientState for notification, skipping', {
              subId,
              expected: triggerResource.config.clientState,
              received: bodyClientState
            })
            continue
          }
        }

        logger.debug('✅ Resolved from trigger_resources:', {
          subscriptionId: subId,
          userId,
          workflowId,
          triggerResourceId
        })
      }

      // Enhanced dedup per notification - use message/resource ID to prevent duplicate processing across multiple subscriptions
      const messageId = change?.resourceData?.id || change?.resourceData?.['@odata.id'] || resource || 'unknown'

      // For email notifications (messages), ignore changeType in dedup key because Microsoft sends both 'created' and 'updated'
      // For other resources, include changeType to allow separate processing
      const resourceLower = resource?.toLowerCase() || ''
      const isEmailNotification = resourceLower.includes('/messages') || resourceLower.includes('/mailfolders')
      const dedupKey = isEmailNotification
        ? `${userId || 'unknown'}:${messageId}` // Email: ignore changeType (created+updated are duplicates)
        : `${userId || 'unknown'}:${messageId}:${changeType || 'unknown'}` // Other: include changeType

      logger.debug('🔑 Deduplication check:', {
        dedupKey,
        messageId,
        changeType,
        isEmailNotification,
        resource,
        subscriptionId: subId,
        userId
      })

      // Try to insert dedup key - if it fails due to unique constraint, it's a duplicate
      const { error: dedupError } = await supabase
        .from('microsoft_webhook_dedup')
        .insert({ dedup_key: dedupKey })

      if (dedupError) {
        // Duplicate key violation (unique constraint) or other error
        if (dedupError.code === '23505') {
          // PostgreSQL unique violation error code
          logger.debug('⏭️ Skipping duplicate notification (already processed):', {
            dedupKey,
            messageId,
            subscriptionId: subId
          })
          continue
        } else {
          // Other error, log but continue processing
          logger.warn('⚠️ Deduplication insert error (continuing anyway):', dedupError)
        }
      }

      // Check if this changeType should trigger the workflow
      // Get the expected changeTypes from trigger config
      if (configuredChangeType && changeType) {
        const allowedTypes = configuredChangeType.split(',').map((t: string) => t.trim())

        if (!allowedTypes.includes(changeType)) {
          logger.debug('⏭️ Skipping notification - changeType not configured:', {
            received: changeType,
            configured: configuredChangeType,
            subscriptionId: subId
          })
          continue
        }
      }

      // OneNote triggers removed - doesn't support webhooks (API deprecated May 2023)

      // For Teams channel message triggers, fetch the actual message data
      const isTeamsMessageTrigger = resourceLower.includes('/teams/') && resourceLower.includes('/channels/') && resourceLower.includes('/messages')
      if (isTeamsMessageTrigger && userId && triggerConfig) {
        try {
          const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
          const graphAuth = new MicrosoftGraphAuth()

          // Get access token for this user
          const accessToken = await graphAuth.getValidAccessToken(userId, 'teams')

          // Extract message ID from resource or resourceData
          const messageId = change?.resourceData?.id

          if (messageId && triggerConfig.teamId && triggerConfig.channelId) {
            // Fetch the actual Teams message to get full content
            const messageResponse = await fetch(
              `https://graph.microsoft.com/v1.0/teams/${triggerConfig.teamId}/channels/${triggerConfig.channelId}/messages/${messageId}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            )

            if (messageResponse.ok) {
              const message = await messageResponse.json()

              logger.debug('✅ Fetched full Teams message data')

              // Update the resourceData with the full message
              change.resourceData = {
                ...change.resourceData,
                ...message,
                // Add our standard fields
                messageId: message.id,
                content: message.body?.content || '',
                senderId: message.from?.user?.id || '',
                senderName: message.from?.user?.displayName || '',
                channelId: triggerConfig.channelId,
                teamId: triggerConfig.teamId,
                timestamp: message.createdDateTime,
                attachments: message.attachments || []
              }
            } else {
              logger.warn('⚠️ Failed to fetch Teams message details, using notification data only:', messageResponse.status)
            }
          }
        } catch (teamsError) {
          logger.error('❌ Error fetching Teams message data (allowing execution with notification data):', teamsError)
          // Continue to execute even if full message fetch fails
        }
      }

      // For Outlook email triggers, fetch the actual email and check filters before triggering
      const isOutlookEmailTrigger = resourceLower.includes('/messages') && !isTeamsMessageTrigger
      if (isOutlookEmailTrigger && userId && triggerConfig) {
        try {
          const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
          const graphAuth = new MicrosoftGraphAuth()

          // Get access token for this user
          const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-outlook')

          // Extract message ID from resource
          const messageId = change?.resourceData?.id

          if (messageId) {
            // Fetch the actual email to check filters
            const emailResponse = await fetch(
              `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            )

            if (emailResponse.ok) {
              const email = await emailResponse.json()

              // Get trigger-specific filter configuration
              const filterConfig = TRIGGER_FILTER_CONFIG[triggerType || '']

              if (!filterConfig) {
                logger.warn(`⚠️ Unknown trigger type: ${triggerType}, allowing all filters`)
              }

              // Check folder filter (only for triggers that support folder filtering)
              if (filterConfig?.supportsFolder && email.parentFolderId) {
                let configFolderId = triggerConfig.folder

                // If no folder configured, use default from trigger config
                if (!configFolderId && filterConfig.defaultFolder) {
                  try {
                    const foldersResponse = await fetch(
                      'https://graph.microsoft.com/v1.0/me/mailFolders',
                      {
                        headers: {
                          'Authorization': `Bearer ${accessToken}`,
                          'Content-Type': 'application/json'
                        }
                      }
                    )

                    if (foldersResponse.ok) {
                      const folders = await foldersResponse.json()
                      const inboxFolder = folders.value.find((f: any) =>
                        f.displayName?.toLowerCase() === 'inbox'
                      )
                      configFolderId = inboxFolder?.id || null
                    }
                  } catch (folderError) {
                    logger.warn('⚠️ Failed to get Inbox folder ID, allowing all folders:', folderError)
                  }
                }

                // Check if current email is in the configured folder
                if (configFolderId && email.parentFolderId !== configFolderId) {
                  try {
                    const folderResponse = await fetch(
                      `https://graph.microsoft.com/v1.0/me/mailFolders/${email.parentFolderId}`,
                      {
                        headers: {
                          'Authorization': `Bearer ${accessToken}`,
                          'Content-Type': 'application/json'
                        }
                      }
                    )

                    const folderName = folderResponse.ok
                      ? (await folderResponse.json()).displayName
                      : email.parentFolderId

                    logger.debug('⏭️ Skipping email - not in configured folder:', {
                      expectedFolderId: configFolderId,
                      actualFolderId: email.parentFolderId,
                      actualFolderName: folderName,
                      subscriptionId: subId
                    })
                  } catch (folderError) {
                    logger.debug('⏭️ Skipping email - not in configured folder:', {
                      expectedFolderId: configFolderId,
                      actualFolderId: email.parentFolderId,
                      subscriptionId: subId
                    })
                  }
                  continue
                }
              }

              // Check subject filter (if trigger supports it)
              if (filterConfig?.supportsSubject && triggerConfig.subject) {
                const configSubject = triggerConfig.subject.toLowerCase().trim()
                const emailSubject = (email.subject || '').toLowerCase().trim()
                const exactMatch = triggerConfig.subjectExactMatch !== false // Default to true

                const isMatch = exactMatch
                  ? emailSubject === configSubject
                  : emailSubject.includes(configSubject)

                if (!isMatch) {
                  // SECURITY: Don't log actual subject content (PII)
                  logger.debug('⏭️ Skipping email - subject does not match filter:', {
                    expectedLength: configSubject.length,
                    receivedLength: emailSubject.length,
                    exactMatch,
                    subscriptionId: subId
                  })
                  continue
                }
              }

              // Check from filter (sender) - if trigger supports it
              if (filterConfig?.supportsSender && triggerConfig.from) {
                const configFrom = triggerConfig.from.toLowerCase().trim()
                const emailFrom = email.from?.emailAddress?.address?.toLowerCase().trim() || ''

                if (emailFrom !== configFrom) {
                  // SECURITY: Don't log actual email addresses (PII)
                  logger.debug('⏭️ Skipping email - from address does not match filter:', {
                    hasExpected: !!configFrom,
                    hasReceived: !!emailFrom,
                    subscriptionId: subId
                  })
                  continue
                }
              }

              // Check to filter (recipient) - if trigger supports it
              if (filterConfig?.supportsRecipient && triggerConfig.to) {
                const configTo = triggerConfig.to.toLowerCase().trim()
                const emailTo = email.toRecipients?.map((r: any) => r.emailAddress?.address?.toLowerCase().trim()) || []

                const hasMatch = emailTo.some((addr: string) => addr === configTo)

                if (!hasMatch) {
                  // SECURITY: Don't log actual email addresses (PII)
                  logger.debug('⏭️ Skipping email - to address does not match filter:', {
                    hasExpected: !!configTo,
                    recipientCount: emailTo.length,
                    subscriptionId: subId
                  })
                  continue
                }
              }

              // Check importance filter (if trigger supports it)
              if (filterConfig?.supportsImportance && triggerConfig.importance && triggerConfig.importance !== 'any') {
                const configImportance = triggerConfig.importance.toLowerCase()
                const emailImportance = (email.importance || 'normal').toLowerCase()

                if (emailImportance !== configImportance) {
                  logger.debug('⏭️ Skipping email - importance does not match filter:', {
                    expected: configImportance,
                    received: emailImportance,
                    subscriptionId: subId
                  })
                  continue
                }
              }

              logger.debug('✅ Email matches all filters, proceeding with workflow execution')
            } else {
              logger.warn('⚠️ Failed to fetch email details for filtering, allowing execution:', emailResponse.status)
            }
          }
        } catch (filterError) {
          logger.error('❌ Error checking email filters (allowing execution):', filterError)
          // Continue to execute even if filter check fails
        }
      }

      // Trigger workflow execution directly (no queue needed)
      if (workflowId && userId) {
        logger.debug('🚀 Triggering workflow execution:', {
          workflowId,
          userId,
          subscriptionId: subId,
          resource,
          changeType
        })

        try {
          // Trigger workflow via workflow execution API
          const base = getWebhookBaseUrl()
          const executionUrl = `${base}/api/workflows/execute`

          const executionPayload = {
            workflowId,
            testMode: false,
            executionMode: 'live',
            skipTriggers: true, // Already triggered by webhook
            inputData: {
              source: 'microsoft-graph-webhook',
              subscriptionId: subId,
              resource,
              changeType,
              resourceData: change?.resourceData,
              notificationPayload: change
            }
          }

          logger.debug('📤 Calling execution API:', executionUrl)
          // SECURITY: Don't log full execution payload (contains resource data/PII)
          logger.debug('📦 Execution payload metadata:', {
            workflowId: executionPayload.workflowId,
            testMode: executionPayload.testMode,
            executionMode: executionPayload.executionMode,
            skipTriggers: executionPayload.skipTriggers,
            hasInputData: !!executionPayload.inputData
          })

          const response = await fetch(executionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId // Pass user context
            },
            body: JSON.stringify(executionPayload)
          })

          if (response.ok) {
            const result = await response.json()
            logger.debug('✅ Workflow execution triggered:', {
              workflowId,
              executionId: result?.executionId,
              status: result?.status
            })
          } else {
            const errorText = await response.text()
            logger.error('❌ Workflow execution failed:', {
              status: response.status,
              error: errorText
            })
          }
        } catch (execError) {
          logger.error('❌ Error triggering workflow:', execError)
        }
      } else {
        logger.warn('⚠️ Cannot trigger workflow - missing workflowId or userId')
      }
    } catch (error) {
      logger.error('❌ Error processing individual notification:', error)
    }
  }

  logger.debug('✅ All notifications processed')
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const validationToken = url.searchParams.get('validationToken') || url.searchParams.get('validationtoken')
    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())

    logger.debug('📥 Microsoft Graph webhook received:', {
      headers: Object.keys(headers),
      bodyLength: body.length,
      timestamp: new Date().toISOString()
    })

    // Handle validation request from Microsoft (either via validationToken query or text/plain body)
    if (validationToken || headers['content-type']?.includes('text/plain')) {
      const token = validationToken || body
      logger.debug('🔍 Validation request received')
      return new NextResponse(token, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    // Handle empty body (some Microsoft notifications are empty)
    if (!body || body.length === 0) {
      logger.debug('⚠️ Empty webhook payload received, skipping')
      return jsonResponse({ success: true, empty: true })
    }

    // Parse payload
    let payload: any
    try {
      payload = JSON.parse(body)
    } catch (error) {
      logger.error('❌ Failed to parse webhook payload:', error)
      return errorResponse('Invalid JSON payload' , 400)
    }

    // Notifications arrive as an array in payload.value
    const notifications: any[] = Array.isArray(payload?.value) ? payload.value : []
    // SECURITY: Don't log full payload (contains PII/resource IDs)
    logger.debug('📋 Webhook payload analysis:', {
      hasValue: !!payload?.value,
      valueIsArray: Array.isArray(payload?.value),
      notificationCount: notifications.length,
      payloadKeys: Object.keys(payload || {})
    })

    if (notifications.length === 0) {
      logger.warn('⚠️ Microsoft webhook payload has no notifications (value array empty)')
      return jsonResponse({ success: true, empty: true })
    }

    const requestId = headers['request-id'] || headers['client-request-id'] || undefined

    // Process notifications synchronously (fast enough for serverless)
    const startTime = Date.now()
    try {
      await processNotifications(notifications, headers, requestId)
      await logWebhookExecution('microsoft-graph', payload, headers, 'queued', Date.now() - startTime)

      // Return 202 after processing
      return new NextResponse(null, { status: 202 })
    } catch (error) {
      logger.error('❌ Notification processing error:', error)
      await logWebhookExecution('microsoft-graph', payload, headers, 'error', Date.now() - startTime)
      return errorResponse('Processing failed' , 500)
    }

  } catch (error: any) {
    logger.error('❌ Microsoft Graph webhook error:', error)
    return errorResponse('Internal server error' , 500)
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const validationToken = url.searchParams.get('validationToken') || url.searchParams.get('validationtoken')
  if (validationToken) {
    logger.debug('🔍 Validation request (GET) received')
    return new NextResponse(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  return jsonResponse({
    message: "Microsoft Graph webhook endpoint active",
    provider: "microsoft-graph",
    methods: ["POST"],
    timestamp: new Date().toISOString(),
    description: "Webhook endpoint for Microsoft Graph workflows. Send POST requests to trigger workflows."
  })
}