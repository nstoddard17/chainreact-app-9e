import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'
import { handleDropboxWebhookEvent } from '@/lib/webhooks/dropboxTriggerHandler'

import { logger } from '@/lib/utils/logger'

// Discord API helpers to resolve IDs to names
async function resolveDiscordChannelName(channelId: string, guildId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.ok) {
      const channel = await response.json()
      logger.debug(`🏷️ Resolved channel ${channelId} to: ${channel.name}`)
      return channel.name || null
    }
  } catch (error) {
    logger.error(`Failed to resolve channel name for ${channelId}:`, error)
  }
  return null
}

async function resolveDiscordGuildName(guildId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.ok) {
      const guild = await response.json()
      logger.debug(`🏷️ Resolved guild ${guildId} to: ${guild.name}`)
      return guild.name || null
    }
  } catch (error) {
    logger.error(`Failed to resolve guild name for ${guildId}:`, error)
  }
  return null
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// In-memory cache to prevent duplicate Discord message processing
// This handles the race condition where two requests arrive nearly simultaneously
const discordMessageCache = new Map<string, { timestamp: number; requestId: string }>()

// Clean up old cache entries every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000)
  for (const [messageId, data] of discordMessageCache.entries()) {
    if (data.timestamp < fiveMinutesAgo) {
      discordMessageCache.delete(messageId)
    }
  }
}, 5 * 60 * 1000)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  const startTime = Date.now()

  // Generate unique request ID for tracking
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const logPrefix = `[${requestId}][${provider}]`

  logger.debug(`🚀 ${logPrefix} Starting webhook processing for provider: ${provider}`)

  // Variables to track for error handling
  let workflow: any = null
  let payload: any = null
  let headers: any = {}

  try {
    // Get the raw body and headers
    const body = await request.text()
    headers = Object.fromEntries(request.headers.entries())

    // Parse JSON if possible
    try {
      payload = JSON.parse(body)
    } catch {
      payload = body
    }

    logger.debug(`📥 ${logPrefix} Received webhook from ${provider}:`, {
      headers: Object.keys(headers),
      payloadKeys: typeof payload === 'object' ? Object.keys(payload) : 'raw body',
      messageId: payload?.id || 'no-id',
      timestamp: new Date().toISOString()
    })

    // Special handling for Discord to prevent duplicate processing
    if (provider === 'discord' && payload?.id) {
      const cachedData = discordMessageCache.get(payload.id)
      if (cachedData && cachedData.requestId !== requestId) {
        const timeDiff = Date.now() - cachedData.timestamp
        if (timeDiff < 1000) { // Within 1 second is likely a duplicate
          logger.debug(`⚡ ${logPrefix} Duplicate Discord message ${payload.id} detected (${timeDiff}ms apart), skipping`)
          return jsonResponse({
            success: true,
            message: 'Duplicate request ignored',
            messageId: payload.id
          })
        }
      }
      // Cache this message ID
      discordMessageCache.set(payload.id, { timestamp: Date.now(), requestId })
    }

    // Fetch workflows that match this provider trigger
    const { data: workflows, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('status', 'active')

    if (workflowError) {
      logger.error(`${logPrefix} Error fetching workflows:`, workflowError)
      throw new Error('Failed to fetch workflows')
    }

    if (!workflows || workflows.length === 0) {
      logger.debug(`${logPrefix} No active workflows found`)
      return jsonResponse({
        success: true,
        message: 'No active workflows to process'
      })
    }

    // Process each matching workflow
    const results = []
    for (const wf of workflows) {
      workflow = wf // Set for error handling

      let workflowNodes: any[] = []
      if (Array.isArray(workflow.nodes)) {
        workflowNodes = workflow.nodes
      } else if (typeof workflow.nodes === 'string') {
        try {
          workflowNodes = JSON.parse(workflow.nodes)
        } catch (parseError) {
          logger.warn(`${logPrefix} Failed to parse workflow nodes JSON for workflow ${workflow.id}:`, parseError)
          workflowNodes = []
        }
      }

      // Find the trigger node for this provider
      const triggerNode = workflowNodes.find((node: any) =>
        node.data?.providerId === provider &&
        node.data?.isTrigger === true
      )

      if (!triggerNode) {
        logger.debug(`${logPrefix} No trigger node found for provider ${provider} in workflow ${workflow.id}, skipping`)
        continue
      }

      // Transform payload for the workflow
      const transformedPayload = await transformPayloadForWorkflow(provider, payload, triggerNode)

      if (!transformedPayload) {
        logger.debug(`${logPrefix} Ignoring webhook payload after transformation (empty payload) for workflow ${workflow.id}`)
        continue
      }

      try {
        // Create execution session
        const executionEngine = new AdvancedExecutionEngine()
        const session = await executionEngine.createExecutionSession(
          workflow.id,
          workflow.user_id,
          'webhook',
          {
            inputData: transformedPayload,
            provider: provider,
            triggerNode: triggerNode,
            requestId: requestId
          }
        )

        logger.debug(`${logPrefix} Created execution session: ${session.id} for workflow ${workflow.id}`)

        // Execute the workflow
        logger.debug(`${logPrefix} Starting workflow execution for workflow ${workflow.id}...`)
        await executionEngine.executeWorkflowAdvanced(session.id, transformedPayload)
        logger.debug(`${logPrefix} Workflow execution completed for workflow ${workflow.id}`)

        // Log webhook execution
        await logWebhookExecution(workflow.id, provider, payload, headers, 'success', Date.now() - startTime)

        results.push({
          workflowId: workflow.id,
          sessionId: session.id,
          success: true,
          executionTime: Date.now() - startTime
        })
      } catch (workflowError: any) {
        logger.error(`${logPrefix} Error processing workflow ${workflow.id}:`, workflowError)
        await logWebhookExecution(workflow.id, provider, payload, headers, 'error', Date.now() - startTime, workflowError.message)

        results.push({
          workflowId: workflow.id,
          sessionId: null,
          success: false,
          error: workflowError.message,
          executionTime: Date.now() - startTime
        })
      }
    }

    // Return results
    if (results.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No matching workflows found for this webhook'
      })
    }

    const successCount = results.filter(r => r.success).length
    return jsonResponse({
      success: successCount > 0,
      message: `Processed ${successCount} of ${results.length} workflows`,
      results
    })

  } catch (error: any) {
    logger.error(`${logPrefix} Fatal error processing webhook:`, error)

    // Log error if we have a workflow context
    if (workflow?.id) {
      await logWebhookExecution(workflow.id, provider, payload, headers, 'error', Date.now() - startTime, error.message)
    }

    return jsonResponse({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

async function transformPayloadForWorkflow(provider: string, payload: any, triggerNode: any): Promise<any> {
  // Transform the external payload to match what the workflow expects
  // Get provider-specific transformations
  const providerTransformation = await getProviderSpecificTransformation(provider, payload)
  if (providerTransformation == null) {
    return null
  }
  
  const baseTransformation = {
    provider,
    timestamp: new Date().toISOString(),
    originalPayload: payload,
    triggerType: triggerNode.data?.type,
    // Add provider-specific transformations
    ...providerTransformation
  }

  return baseTransformation
}

async function getProviderSpecificTransformation(provider: string, payload: any): Promise<any> {
  switch (provider) {
    case 'gmail':
      return {
        email: {
          subject: payload.subject || payload.snippet,
          from: payload.from || payload.sender,
          body: payload.body || payload.snippet,
          threadId: payload.threadId,
          messageId: payload.messageId
        }
      }
    
    case 'slack':
      {
        const event = payload?.event ?? payload
        if (!event) {
          return null
        }

        const subtype = event.subtype ?? payload?.subtype
        if (subtype === 'message_deleted') {
          logger.debug('🧹 [Slack Workflow Webhook] Ignoring message_deleted event', {
            channel: event.channel ?? payload?.channel,
            ts: event.deleted_ts || event.ts || payload?.ts
          })
          return null
        }

        return {
          message: {
            text: event.text ?? payload?.text,
            channel: event.channel ?? payload?.channel,
            user: event.user ?? payload?.user,
            timestamp: event.ts ?? payload?.ts,
            threadTs: event.thread_ts ?? payload?.thread_ts,
            team: event.team ?? payload?.team ?? payload?.team_id
          }
        }
      }
    
    case 'discord':
      logger.debug('🔧 Discord payload received for transformation:', JSON.stringify(payload, null, 2))

      // Resolve Discord names from IDs
      const channelName = await resolveDiscordChannelName(payload.channel_id, payload.guild_id)
      const guildName = await resolveDiscordGuildName(payload.guild_id)

      // Return flat data structure that matches the outputSchema in discord node definition
      const transformedData = {
        messageId: payload.id || '',
        content: payload.content || '',
        authorId: payload.author?.id || '',
        authorName: payload.author?.username || payload.author?.global_name || payload.author?.display_name || 'Unknown User',
        channelId: payload.channel_id || '',
        channelName: channelName || `Channel ${payload.channel_id}`,
        guildId: payload.guild_id || '',
        guildName: guildName || `Server ${payload.guild_id}`,
        timestamp: payload.timestamp || new Date().toISOString(),
        attachments: payload.attachments || [],
        mentions: payload.mentions || []
      }
      logger.debug('🔧 Transformed Discord data:', JSON.stringify(transformedData, null, 2))
      return transformedData
    
    case 'github':
      return {
        issue: {
          title: payload.issue?.title,
          body: payload.issue?.body,
          number: payload.issue?.number,
          state: payload.issue?.state
        },
        repository: payload.repository
      }
    
    case 'notion':
      return {
        page: {
          id: payload.page?.id,
          title: payload.page?.properties?.title,
          url: payload.page?.url
        }
      }
    
    case 'hubspot':
      return {
        contact: {
          id: payload.objectId,
          properties: payload.properties
        }
      }
    
    case 'airtable':
      return {
        record: {
          id: payload.id,
          fields: payload.fields,
          table: payload.table
        }
      }
    
    default:
      return {}
  }
}

async function logWebhookExecution(
  workflowId: string,
  provider: string,
  payload: any,
  headers: any,
  status: 'success' | 'error',
  executionTime: number,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase
      .from('webhook_executions')
      .insert({
        workflow_id: workflowId,
        trigger_type: `${provider}_trigger`,
        provider_id: provider,
        payload: payload,
        headers: headers,
        status: status,
        error_message: errorMessage,
        execution_time_ms: executionTime,
        created_at: new Date().toISOString()
      })
  } catch (error) {
    logger.error('Error logging webhook execution:', error)
  }
}
