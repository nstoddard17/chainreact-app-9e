import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'
import { handleDropboxWebhookEvent } from '@/lib/webhooks/dropboxTriggerHandler'

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
      console.log(`🏷️ Resolved channel ${channelId} to: ${channel.name}`)
      return channel.name || null
    }
  } catch (error) {
    console.error(`Failed to resolve channel name for ${channelId}:`, error)
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
      console.log(`🏷️ Resolved guild ${guildId} to: ${guild.name}`)
      return guild.name || null
    }
  } catch (error) {
    console.error(`Failed to resolve guild name for ${guildId}:`, error)
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
  
  // Generate unique request ID for tracking
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  console.log(`🚀 [${requestId}] Starting webhook processing for provider: ${provider}`)
  
  try {
    // Get the raw body and headers
    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())
    
    // Parse JSON if possible
    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      payload = body
    }

    console.log(`📥 [${requestId}] Received webhook from ${provider}:`, {
      headers: Object.keys(headers),
      payloadKeys: typeof payload === 'object' ? Object.keys(payload) : 'raw body',
      messageId: payload?.id || 'no-id',
      timestamp: new Date().toISOString()
    })

    let workflowNodes: any[] = []
    if (Array.isArray(workflow.nodes)) {
      workflowNodes = workflow.nodes
    } else if (typeof workflow.nodes === 'string') {
      try {
        workflowNodes = JSON.parse(workflow.nodes)
      } catch (parseError) {
        console.warn(`${logPrefix} Failed to parse workflow nodes JSON for workflow ${workflow.id}:`, parseError)
        workflowNodes = []
      }
    }

    // Find the trigger node for this provider
    const triggerNode = workflowNodes.find((node: any) => 
      node.data?.providerId === provider && 
      node.data?.isTrigger === true
    )

    if (!triggerNode) {
      throw new Error(`No trigger node found for provider: ${provider}`)
    }

    // Transform payload for the workflow
    const transformedPayload = await transformPayloadForWorkflow(provider, payload, triggerNode)
    
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

    console.log(`${logPrefix} Created execution session: ${session.id}`)

    // Execute the workflow
    console.log(`${logPrefix} Starting workflow execution...`)
    await executionEngine.executeWorkflowAdvanced(session.id, transformedPayload)
    console.log(`${logPrefix} Workflow execution completed`)
    
    // Log webhook execution
    await logWebhookExecution(workflow.id, provider, payload, headers, 'success', Date.now() - startTime)

    return {
      workflowId: workflow.id,
      sessionId: session.id,
      success: true,
      executionTime: Date.now() - startTime
    }

  } catch (error) {
    // Log error
    await logWebhookExecution(workflow.id, provider, payload, headers, 'error', Date.now() - startTime, error.message)
    throw error
  }
}

async function transformPayloadForWorkflow(provider: string, payload: any, triggerNode: any): Promise<any> {
  // Transform the external payload to match what the workflow expects
  // Get provider-specific transformations
  const providerTransformation = await getProviderSpecificTransformation(provider, payload)
  
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
      return {
        message: {
          text: payload.text,
          channel: payload.channel,
          user: payload.user,
          timestamp: payload.ts
        }
      }
    
    case 'discord':
      console.log('🔧 Discord payload received for transformation:', JSON.stringify(payload, null, 2))
      
      // Resolve Discord names from IDs
      const channelName = await resolveDiscordChannelName(payload.channel_id, payload.guild_id)
      const guildName = await resolveDiscordGuildName(payload.guild_id)
      
      const transformedData = {
        message: {
          content: payload.content || '',
          channelId: payload.channel_id || '',
          channelName: channelName || `Channel ${payload.channel_id}`,
          authorId: payload.author?.id || '',
          authorName: payload.author?.username || payload.author?.global_name || payload.author?.display_name || 'Unknown User',
          authorDisplayName: payload.author?.display_name || payload.author?.username || payload.author?.global_name || 'Unknown User',
          guildId: payload.guild_id || '',
          guildName: guildName || `Server ${payload.guild_id}`,
          messageId: payload.id || '',
          timestamp: payload.timestamp || new Date().toISOString()
        }
      }
      console.log('🔧 Transformed Discord data:', JSON.stringify(transformedData, null, 2))
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
    console.error('Error logging webhook execution:', error)
  }
}
