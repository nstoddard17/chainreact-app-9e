import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Store active subscriptions in memory (in production, use database)
const activeSubscriptions = new Map<string, any>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())
    
    console.log('📥 Microsoft Graph webhook received:', {
      headers: Object.keys(headers),
      bodyLength: body.length,
      timestamp: new Date().toISOString()
    })

    // Handle validation request from Microsoft
    if (headers['content-type']?.includes('text/plain')) {
      console.log('🔍 Validation request received')
      
      // Return the validation token as plain text
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain'
        }
      })
    }

    // Handle actual webhook notifications
    let payload
    try {
      payload = JSON.parse(body)
    } catch (error) {
      console.error('❌ Failed to parse webhook payload:', error)
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // Verify the webhook is from Microsoft (basic verification)
    const clientState = headers['clientstate']
    if (!clientState) {
      console.warn('⚠️ No clientState header found')
      // In production, implement proper verification
    }

    // Process the webhook data
    console.log('📊 Processing Microsoft Graph webhook:', {
      subscriptionId: payload.subscriptionId,
      changeType: payload.changeType,
      resource: payload.resource,
      clientState: clientState
    })

    // Find workflows that use Microsoft Graph triggers
    const workflows = await findWorkflowsForMicrosoftGraph(payload)
    
    if (workflows.length === 0) {
      console.log('No active workflows found for Microsoft Graph')
      return NextResponse.json({ 
        message: 'No active workflows for this provider',
        provider: 'microsoft-graph'
      }, { status: 200 })
    }

    // Process each workflow
    const results = []
    for (const workflow of workflows) {
      try {
        const result = await processMicrosoftGraphWebhook(workflow, payload, headers)
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

    // Log the webhook execution
    await logWebhookExecution(
      'microsoft-graph',
      payload,
      headers,
      results.length > 0 ? 'success' : 'no_workflows',
      Date.now()
    )

    return NextResponse.json({
      success: true,
      provider: 'microsoft-graph',
      workflowsProcessed: results.length,
      results: results
    })

  } catch (error: any) {
    console.error('❌ Microsoft Graph webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: "Microsoft Graph webhook endpoint active",
    provider: "microsoft-graph",
    methods: ["POST"],
    timestamp: new Date().toISOString(),
    description: "Webhook endpoint for Microsoft Graph workflows. Send POST requests to trigger workflows."
  })
}

async function findWorkflowsForMicrosoftGraph(payload: any): Promise<any[]> {
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('status', 'active')

  if (error) {
    console.error('Error fetching workflows:', error)
    return []
  }

  // Filter workflows that have Microsoft Graph triggers
  return workflows.filter(workflow => {
    try {
      const nodes = JSON.parse(workflow.nodes || '[]')
      return nodes.some((node: any) => 
        node.type?.startsWith('microsoft_graph_trigger') ||
        node.type?.startsWith('outlook_trigger')
      )
    } catch {
      return false
    }
  })
}

async function processMicrosoftGraphWebhook(
  workflow: any,
  payload: any,
  headers: any
): Promise<any> {
  const startTime = Date.now()
  
  try {
    // Transform the payload for workflow execution
    const transformedPayload = transformMicrosoftGraphPayload(payload)
    
    // Execute the workflow
    const executionEngine = new (await import('@/lib/execution/advancedExecutionEngine')).AdvancedExecutionEngine()
    
    const result = await executionEngine.executeWorkflow(workflow.id, {
      triggerData: transformedPayload,
      webhookSource: 'microsoft-graph',
      headers: headers
    })

    const executionTime = Date.now() - startTime
    
    return {
      workflowId: workflow.id,
      sessionId: result.sessionId,
      success: true,
      executionTime: executionTime,
      result: result
    }
  } catch (error: any) {
    const executionTime = Date.now() - startTime
    
    return {
      workflowId: workflow.id,
      success: false,
      error: error.message,
      executionTime: executionTime
    }
  }
}

function transformMicrosoftGraphPayload(payload: any): any {
  // Transform Microsoft Graph webhook payload to match our trigger expectations
  return {
    subscriptionId: payload.subscriptionId,
    changeType: payload.changeType,
    resource: payload.resource,
    clientState: payload.clientState,
    value: payload.value || [],
    // Add common fields that triggers might expect
    timestamp: new Date().toISOString(),
    source: 'microsoft-graph'
  }
}

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
