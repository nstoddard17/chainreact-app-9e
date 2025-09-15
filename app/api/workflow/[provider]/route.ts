import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'

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
    
    // EARLY duplicate detection for Discord - before any processing
    if (provider === 'discord') {
      console.log(`📥 Discord payload full content:`, JSON.stringify(payload, null, 2))
      
      const messageId = payload.id
      if (messageId) {
        console.log(`🔍 [${requestId}] Checking for duplicate Discord message: ${messageId} at ${new Date().toISOString()}`)
        
        // Check in-memory cache first for very recent duplicates
        const cachedEntry = discordMessageCache.get(messageId)
        if (cachedEntry) {
          const timeDiff = Date.now() - cachedEntry.timestamp
          console.log(`🚫 [${requestId}] Duplicate Discord message detected in cache: ${messageId} - skipping (original request ${cachedEntry.requestId}, ${timeDiff}ms ago)`)
          return NextResponse.json({ 
            success: true, 
            message: 'Duplicate message ignored - cached',
            originalRequestId: cachedEntry.requestId,
            timeDifference: timeDiff,
            messageId: messageId,
            requestId: requestId
          })
        }
        
        // Add to cache immediately to prevent future duplicates
        discordMessageCache.set(messageId, { timestamp: Date.now(), requestId: requestId })
        console.log(`📝 [${requestId}] Added Discord message to cache: ${messageId}`)
        
        // Also check database for older duplicates (in case server restarted)
        const { data: existingExecutions } = await supabase
          .from('webhook_executions')
          .select('id, created_at, payload, status, workflow_id')
          .eq('provider_id', 'discord')
          .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(50)
          
        const existingExecution = existingExecutions?.find(exec => 
          exec.payload && exec.payload.id === messageId
        )
        
        if (existingExecution) {
          console.log(`🚫 [${requestId}] Duplicate Discord message detected in database: ${messageId} - skipping (original execution ${existingExecution.id} at ${existingExecution.created_at})`)
          return NextResponse.json({ 
            success: true, 
            message: 'Duplicate message ignored - already in database',
            originalTimestamp: existingExecution.created_at,
            originalExecutionId: existingExecution.id,
            messageId: messageId,
            requestId: requestId
          })
        }
        
        console.log(`✅ [${requestId}] New Discord message: ${messageId} - proceeding with workflow`)
      }
    }

    // Handle Slack URL verification
    if (provider === 'slack' && payload.type === 'url_verification') {
      console.log('🔐 Handling Slack URL verification challenge')
      return new NextResponse(payload.challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    // Handle Microsoft Graph validation (plain text response)
    if (provider === 'microsoft' && headers['content-type']?.includes('text/plain')) {
      console.log('🔐 Handling Microsoft Graph validation')
      return new NextResponse(body, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    // Handle Notion webhook URL verification (they POST a token to our URL)
    if (provider === 'notion') {
      // Token can be in headers or JSON body depending on Notion UI
      const tokenFromHeader = headers['x-notion-verification-token'] || headers['notion-verification-token']
      const tokenFromBody = typeof payload === 'object' ? (payload?.verification_token || payload?.verificationToken) : undefined
      const verificationToken = tokenFromHeader || tokenFromBody
      if (verificationToken) {
        console.log('🧩 Notion verification token received:', verificationToken)
        try {
          await supabase
            .from('webhook_logs')
            .insert({
              provider: 'notion',
              event_type: 'verification',
              payload: { verification_token: verificationToken },
              status: 'received'
            })
        } catch (e) {
          console.warn('Failed to persist Notion verification token', e)
        }
        return NextResponse.json({
          message: 'Notion verification token received. Copy this value and paste it in the Notion dashboard to verify the webhook URL.',
          verification_token: verificationToken,
          timestamp: new Date().toISOString()
        })
      }
    }

    // Find all active workflows that have triggers for this provider
    // Pass the payload for provider-specific filtering (e.g., Discord channel matching)
    const workflows = await findWorkflowsForProvider(provider, payload)
    
    if (workflows.length === 0) {
      console.log(`[${requestId}] No active workflows found for provider: ${provider}`)
      return NextResponse.json({ 
        message: 'No active workflows for this provider',
        provider: provider,
        requestId: requestId
      }, { status: 200 })
    }

    console.log(`[${requestId}] Found ${workflows.length} workflow(s) to process`)

    // Process each workflow
    const results = []
    for (const workflow of workflows) {
      try {
        console.log(`[${requestId}] Processing workflow: ${workflow.name} (${workflow.id})`)
        const result = await processWorkflowWebhook(workflow, payload, headers, provider, requestId)
        results.push(result)
      } catch (error) {
        console.error(`Error processing workflow ${workflow.id}:`, error)
        results.push({ 
          workflowId: workflow.id, 
          success: false, 
          error: error.message 
        })
      }
    }



    console.log(`[${requestId}] Completed processing ${results.length} workflow(s) for ${provider}`)
    
    return NextResponse.json({
      success: true,
      provider: provider,
      workflowsProcessed: results.length,
      results: results,
      requestId: requestId
    })

  } catch (error: any) {
    console.error(`Webhook error for ${provider}:`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  
  // Dropbox webhook verification (echo challenge)
  if (provider === 'dropbox') {
    const challenge = request.nextUrl.searchParams.get('challenge')
    if (challenge) {
      return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
  }
  
  // Facebook Webhooks verification flow (supports Pages and Users tokens)
  if (provider === 'facebook') {
    const mode = request.nextUrl.searchParams.get('hub.mode')
    const token = request.nextUrl.searchParams.get('hub.verify_token')
    const challenge = request.nextUrl.searchParams.get('hub.challenge')
    const tokenMatches = [
      process.env.FACEBOOK_PAGES_VERIFY_TOKEN,
      process.env.FACEBOOK_USER_VERIFY_TOKEN,
    ].filter(Boolean).some((t) => t === token)
    if (mode === 'subscribe' && tokenMatches && challenge) {
      return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
  }

  // Instagram Webhooks verification flow
  if (provider === 'instagram') {
    const mode = request.nextUrl.searchParams.get('hub.mode')
    const token = request.nextUrl.searchParams.get('hub.verify_token')
    const challenge = request.nextUrl.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN && challenge) {
      return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
  }
  
  const providerInfo = {
    slack: {
      description: "Slack webhook endpoint. Supports URL verification and event processing.",
      setup: "Add this URL to your Slack app's Event Subscriptions with events: message.channels, message.groups, message.im, message.mpim",
      verification: "Responds to url_verification challenges automatically"
    },
    microsoft: {
      description: "Microsoft Graph webhook endpoint. Supports validation and subscription notifications.",
      setup: "Use this URL for Microsoft Graph subscription notificationUrl",
      verification: "Responds to validation requests automatically"
    },
    gmail: {
      description: "Gmail webhook endpoint for Google Workspace notifications.",
      setup: "Configure in Google Cloud Console Pub/Sub subscriptions"
    },
    discord: {
      description: "Discord webhook endpoint for bot events and interactions.",
      setup: "Configure in Discord Developer Portal webhook settings"
    }
  }
  
  const info = providerInfo[provider as keyof typeof providerInfo] || {
    description: `Webhook endpoint for ${provider} workflows.`,
    setup: "Configure this URL in your provider's webhook settings"
  }
  
  return NextResponse.json({
    message: "Workflow webhook endpoint active",
    provider: provider,
    methods: ["POST", "GET"],
    timestamp: new Date().toISOString(),
    description: info.description,
    setup: info.setup,
    verification: info.verification || "Standard webhook processing"
  })
}

async function findWorkflowsForProvider(provider: string, payload?: any): Promise<any[]> {
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('*')
    .in('status', ['draft', 'active']) // Include both draft and active workflows

  if (error) {
    console.error('Error fetching workflows:', error)
    return []
  }

  console.log(`🔍 Found ${workflows.length} workflows (draft/active) for provider: ${provider}`)

  // For Discord, log the incoming channel for debugging
  if (provider === 'discord' && payload?.channel_id) {
    console.log(`📨 Incoming Discord message from channel: ${payload.channel_id}, guild: ${payload.guild_id}`)
  }

  // Filter workflows that have triggers for this provider
  const matchingWorkflows = workflows.filter(workflow => {
    try {
      const nodes = workflow.nodes || []

      // Find trigger nodes for this provider
      const providerTriggers = nodes.filter((node: any) =>
        node.data?.providerId === provider &&
        node.data?.isTrigger === true
      )

      if (providerTriggers.length === 0) {
        return false
      }

      // For Discord, check if the channel matches
      if (provider === 'discord' && payload?.channel_id) {
        const hasMatchingChannel = providerTriggers.some((trigger: any) => {
          const configuredChannelId = trigger.data?.config?.channelId

          // Log the trigger configuration for debugging
          console.log(`🔍 Checking Discord trigger in workflow "${workflow.name}":`, {
            configuredChannelId: configuredChannelId || 'NOT_CONFIGURED',
            triggerType: trigger.data?.type,
            hasConfig: !!trigger.data?.config,
            allConfigKeys: trigger.data?.config ? Object.keys(trigger.data.config) : []
          })

          // If no channel is configured, skip this trigger
          if (!configuredChannelId) {
            console.log(`⚠️ Discord trigger in workflow ${workflow.name} has no channel configured`)
            return false
          }

          // Check if the incoming message's channel matches the configured channel
          const matches = configuredChannelId === payload.channel_id

          if (matches) {
            console.log(`✅ Channel match! Message from ${payload.channel_id} matches trigger config ${configuredChannelId} in workflow: ${workflow.name}`)
          } else {
            console.log(`❌ Channel mismatch: Message from ${payload.channel_id} doesn't match trigger config ${configuredChannelId} in workflow: ${workflow.name}`)
          }

          return matches
        })

        if (!hasMatchingChannel) {
          return false
        }
      }

      console.log(`✅ Found matching workflow: ${workflow.name} (${workflow.id}) - status: ${workflow.status}`)
      return true

    } catch (error) {
      console.error('Error checking workflow nodes:', error)
      return false
    }
  })

  console.log(`🎯 Final matching workflows for ${provider}: ${matchingWorkflows.length}`)
  return matchingWorkflows
}

async function processWorkflowWebhook(
  workflow: any,
  payload: any,
  headers: any,
  provider: string,
  requestId?: string
): Promise<any> {
  const startTime = Date.now()
  
  try {
    const logPrefix = requestId ? `[${requestId}]` : '';
    console.log(`${logPrefix} Processing workflow ${workflow.id} (${workflow.name})`)
    
    // Find the trigger node for this provider
    const triggerNode = workflow.nodes.find((node: any) => 
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
