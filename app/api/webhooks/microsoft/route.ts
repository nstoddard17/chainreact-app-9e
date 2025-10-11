import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

// Helper function - hoisted above POST handler to avoid TDZ
async function logWebhookExecution(
  provider: string,
  payload: any,
  headers: any,
  status: string,
  executionTime: number
): Promise<void> {
  try {
    await supabase
      .from('webhook_logs')
      .insert({
        provider: provider,
        payload: payload,
        headers: headers,
        status: status,
        execution_time: executionTime,
        timestamp: new Date().toISOString()
      })
  } catch (error) {
    console.error('Failed to log webhook execution:', error)
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
      console.log('🔍 Processing notification:', {
        subscriptionId: change?.subscriptionId,
        changeType: change?.changeType,
        resource: change?.resource,
        hasClientState: !!change?.clientState,
        resourceData: change?.resourceData
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
      if (subId) {
        console.log('🔍 Looking up subscription:', subId)

        const { data: triggerResource, error: resourceError } = await supabase
          .from('trigger_resources')
          .select('id, user_id, workflow_id, config')
          .eq('external_id', subId)
          .eq('resource_type', 'subscription')
          .like('provider_id', 'microsoft%')
          .maybeSingle()

        if (!triggerResource) {
          console.warn('⚠️ Subscription not found in trigger_resources (likely old/orphaned subscription):', {
            subId,
            message: 'This subscription is not tracked in trigger_resources. Deactivate/reactivate workflow to clean up.'
          })
          continue
        }

        userId = triggerResource.user_id
        workflowId = triggerResource.workflow_id
        triggerResourceId = triggerResource.id
        configuredChangeType = triggerResource.config?.changeType || null

        // Verify clientState if present
        if (bodyClientState && triggerResource.config?.clientState) {
          if (bodyClientState !== triggerResource.config.clientState) {
            console.warn('⚠️ Invalid clientState for notification, skipping', {
              subId,
              expected: triggerResource.config.clientState,
              received: bodyClientState
            })
            continue
          }
        }

        console.log('✅ Resolved from trigger_resources:', {
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
      const isEmailNotification = resource?.includes('/messages') || resource?.includes('/mailFolders')
      const dedupKey = isEmailNotification
        ? `${userId || 'unknown'}:${messageId}` // Email: ignore changeType (created+updated are duplicates)
        : `${userId || 'unknown'}:${messageId}:${changeType || 'unknown'}` // Other: include changeType

      console.log('🔑 Deduplication check:', {
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
          console.log('⏭️ Skipping duplicate notification (already processed):', {
            dedupKey,
            messageId,
            subscriptionId: subId
          })
          continue
        } else {
          // Other error, log but continue processing
          console.warn('⚠️ Deduplication insert error (continuing anyway):', dedupError)
        }
      }

      // Check if this changeType should trigger the workflow
      // Get the expected changeTypes from trigger config
      if (configuredChangeType && changeType) {
        const allowedTypes = configuredChangeType.split(',').map((t: string) => t.trim())

        if (!allowedTypes.includes(changeType)) {
          console.log('⏭️ Skipping notification - changeType not configured:', {
            received: changeType,
            configured: configuredChangeType,
            subscriptionId: subId
          })
          continue
        }
      }

      // For Outlook email triggers, fetch the actual email and check filters before triggering
      const isOutlookEmailTrigger = resource?.includes('/Messages') || resource?.includes('/messages')
      if (isOutlookEmailTrigger && userId && triggerResource.config) {
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

              // Check subject filter
              if (triggerResource.config.subject) {
                const configSubject = triggerResource.config.subject.toLowerCase().trim()
                const emailSubject = (email.subject || '').toLowerCase().trim()

                if (!emailSubject.includes(configSubject)) {
                  console.log('⏭️ Skipping email - subject does not match filter:', {
                    expected: configSubject,
                    received: emailSubject,
                    subscriptionId: subId
                  })
                  continue
                }
              }

              // Check from filter
              if (triggerResource.config.from) {
                const configFrom = triggerResource.config.from.toLowerCase().trim()
                const emailFrom = email.from?.emailAddress?.address?.toLowerCase().trim() || ''

                if (emailFrom !== configFrom) {
                  console.log('⏭️ Skipping email - from address does not match filter:', {
                    expected: configFrom,
                    received: emailFrom,
                    subscriptionId: subId
                  })
                  continue
                }
              }

              // Check importance filter
              if (triggerResource.config.importance && triggerResource.config.importance !== 'any') {
                const configImportance = triggerResource.config.importance.toLowerCase()
                const emailImportance = (email.importance || 'normal').toLowerCase()

                if (emailImportance !== configImportance) {
                  console.log('⏭️ Skipping email - importance does not match filter:', {
                    expected: configImportance,
                    received: emailImportance,
                    subscriptionId: subId
                  })
                  continue
                }
              }

              console.log('✅ Email matches all filters, proceeding with workflow execution')
            } else {
              console.warn('⚠️ Failed to fetch email details for filtering, allowing execution:', emailResponse.status)
            }
          }
        } catch (filterError) {
          console.error('❌ Error checking email filters (allowing execution):', filterError)
          // Continue to execute even if filter check fails
        }
      }

      // Trigger workflow execution directly (no queue needed)
      if (workflowId && userId) {
        console.log('🚀 Triggering workflow execution:', {
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

          console.log('📤 Calling execution API:', executionUrl)
          console.log('📦 Execution payload:', JSON.stringify(executionPayload, null, 2))

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
            console.log('✅ Workflow execution triggered:', {
              workflowId,
              executionId: result?.executionId,
              status: result?.status
            })
          } else {
            const errorText = await response.text()
            console.error('❌ Workflow execution failed:', {
              status: response.status,
              error: errorText
            })
          }
        } catch (execError) {
          console.error('❌ Error triggering workflow:', execError)
        }
      } else {
        console.warn('⚠️ Cannot trigger workflow - missing workflowId or userId')
      }
    } catch (error) {
      console.error('❌ Error processing individual notification:', error)
    }
  }

  console.log('✅ All notifications processed')
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const validationToken = url.searchParams.get('validationToken') || url.searchParams.get('validationtoken')
    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())

    console.log('📥 Microsoft Graph webhook received:', {
      headers: Object.keys(headers),
      bodyLength: body.length,
      timestamp: new Date().toISOString()
    })

    // Handle validation request from Microsoft (either via validationToken query or text/plain body)
    if (validationToken || headers['content-type']?.includes('text/plain')) {
      const token = validationToken || body
      console.log('🔍 Validation request received')
      return new NextResponse(token, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    // Handle empty body (some Microsoft notifications are empty)
    if (!body || body.length === 0) {
      console.log('⚠️ Empty webhook payload received, skipping')
      return NextResponse.json({ success: true, empty: true })
    }

    // Parse payload
    let payload: any
    try {
      payload = JSON.parse(body)
    } catch (error) {
      console.error('❌ Failed to parse webhook payload:', error)
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // Notifications arrive as an array in payload.value
    const notifications: any[] = Array.isArray(payload?.value) ? payload.value : []
    console.log('📋 Webhook payload analysis:', {
      hasValue: !!payload?.value,
      valueIsArray: Array.isArray(payload?.value),
      notificationCount: notifications.length,
      payloadKeys: Object.keys(payload || {}),
      fullPayload: JSON.stringify(payload, null, 2)
    })

    if (notifications.length === 0) {
      console.warn('⚠️ Microsoft webhook payload has no notifications (value array empty)')
      return NextResponse.json({ success: true, empty: true })
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
      console.error('❌ Notification processing error:', error)
      await logWebhookExecution('microsoft-graph', payload, headers, 'error', Date.now() - startTime)
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }

  } catch (error: any) {
    console.error('❌ Microsoft Graph webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const validationToken = url.searchParams.get('validationToken') || url.searchParams.get('validationtoken')
  if (validationToken) {
    console.log('🔍 Validation request (GET) received')
    return new NextResponse(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  return NextResponse.json({
    message: "Microsoft Graph webhook endpoint active",
    provider: "microsoft-graph",
    methods: ["POST"],
    timestamp: new Date().toISOString(),
    description: "Webhook endpoint for Microsoft Graph workflows. Send POST requests to trigger workflows."
  })
}