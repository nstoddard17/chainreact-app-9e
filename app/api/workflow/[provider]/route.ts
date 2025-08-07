import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  
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

    console.log(`📥 Received webhook from ${provider}:`, {
      headers: Object.keys(headers),
      payloadKeys: typeof payload === 'object' ? Object.keys(payload) : 'raw body',
      timestamp: new Date().toISOString()
    })

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

    // Find all active workflows that have triggers for this provider
    const workflows = await findWorkflowsForProvider(provider)
    
    if (workflows.length === 0) {
      console.log(`No active workflows found for provider: ${provider}`)
      return NextResponse.json({ 
        message: 'No active workflows for this provider',
        provider: provider
      }, { status: 200 })
    }

    // Process each workflow
    const results = []
    for (const workflow of workflows) {
      try {
        const result = await processWorkflowWebhook(workflow, payload, headers, provider)
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

    return NextResponse.json({
      success: true,
      provider: provider,
      workflowsProcessed: results.length,
      results: results
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

async function findWorkflowsForProvider(provider: string): Promise<any[]> {
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('status', 'active')

  if (error) {
    console.error('Error fetching workflows:', error)
    return []
  }

  // Filter workflows that have triggers for this provider
  return workflows.filter(workflow => {
    try {
      const nodes = workflow.nodes || []
      return nodes.some((node: any) => 
        node.data?.providerId === provider && 
        node.data?.isTrigger === true
      )
    } catch {
      return false
    }
  })
}

async function processWorkflowWebhook(
  workflow: any,
  payload: any,
  headers: any,
  provider: string
): Promise<any> {
  const startTime = Date.now()
  
  try {
    // Find the trigger node for this provider
    const triggerNode = workflow.nodes.find((node: any) => 
      node.data?.providerId === provider && 
      node.data?.isTrigger === true
    )

    if (!triggerNode) {
      throw new Error(`No trigger node found for provider: ${provider}`)
    }

    // Transform payload for the workflow
    const transformedPayload = transformPayloadForWorkflow(provider, payload, triggerNode)
    
    // Create execution session
    const executionEngine = new AdvancedExecutionEngine()
    const session = await executionEngine.createExecutionSession(
      workflow.id,
      workflow.user_id,
      'webhook',
      { 
        inputData: transformedPayload,
        provider: provider,
        triggerNode: triggerNode
      }
    )

    // Execute the workflow
    await executionEngine.executeWorkflowAdvanced(session.id, transformedPayload)
    
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

function transformPayloadForWorkflow(provider: string, payload: any, triggerNode: any): any {
  // Transform the external payload to match what the workflow expects
  const baseTransformation = {
    provider,
    timestamp: new Date().toISOString(),
    originalPayload: payload,
    triggerType: triggerNode.data?.type,
    // Add provider-specific transformations
    ...getProviderSpecificTransformation(provider, payload)
  }

  return baseTransformation
}

function getProviderSpecificTransformation(provider: string, payload: any): any {
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
      return {
        message: {
          content: payload.content,
          channelId: payload.channel_id,
          authorId: payload.author?.id,
          guildId: payload.guild_id
        }
      }
    
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
