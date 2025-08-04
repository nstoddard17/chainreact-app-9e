import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'
import { logWebhookEvent } from './event-logger'

export interface WebhookEvent {
  id: string
  provider: string
  service?: string
  eventType: string
  eventData: any
  requestId: string
  timestamp: Date
}

/**
 * Enhanced webhook event processor with instant execution
 */
export async function processWebhookEvent(event: WebhookEvent): Promise<any> {
  const startTime = Date.now()
  
  try {
    // 1. Store event for audit trail (non-blocking)
    await storeWebhookEvent(event)
    
    // 2. Find matching workflows instantly
    const matchingWorkflows = await findMatchingWorkflows(event)
    
    // 3. Execute workflows in parallel for maximum speed
    const executionPromises = matchingWorkflows.map(workflow => 
      executeWorkflowInstantly(workflow, event)
    )
    
    // 4. Wait for all executions to complete
    const results = await Promise.allSettled(executionPromises)
    
    // 5. Log processing time
    const processingTime = Date.now() - startTime
    await logWebhookEvent({
      provider: event.provider,
      requestId: event.requestId,
      service: event.service,
      eventType: event.eventType,
      status: 'success',
      processingTime,
      timestamp: new Date().toISOString(),
      result: { 
        workflowsTriggered: matchingWorkflows.length,
        executionResults: results.map(r => r.status)
      }
    })
    
    return {
      success: true,
      workflowsTriggered: matchingWorkflows.length,
      processingTime
    }
    
  } catch (error) {
    const processingTime = Date.now() - startTime
    await logWebhookEvent({
      provider: event.provider,
      requestId: event.requestId,
      service: event.service,
      eventType: event.eventType,
      status: 'error',
      processingTime,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    throw error
  }
}

/**
 * Find workflows that match the webhook event criteria
 */
async function findMatchingWorkflows(event: WebhookEvent): Promise<any[]> {
  const supabase = await createSupabaseServiceClient()
  
  // Find all active workflows first, then filter in code
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select(`
      id,
      name,
      user_id,
      nodes,
      connections,
      status
    `)
    .eq('status', 'active')
  
  if (error) {
    console.error('Error finding matching workflows:', error)
    return []
  }
  
  console.log(`🔍 Found ${workflows?.length || 0} active workflows`)
  
  // Filter workflows based on trigger conditions
  const matchingWorkflows = workflows?.filter(workflow => {
    console.log(`🔍 Checking workflow: "${workflow.name}"`)
    
    if (!workflow.nodes || workflow.nodes.length === 0) {
      console.log(`   ❌ No nodes found`)
      return false
    }
    
    const triggerNode = workflow.nodes?.find((node: any) => {
      console.log(`   🔍 Checking node: ${node.type}`)
      console.log(`      isTrigger: ${node.data?.isTrigger}`)
      console.log(`      triggerType: ${node.data?.triggerType}`)
      console.log(`      triggerConfig:`, node.data?.triggerConfig)
      
      return node.data?.isTrigger && 
        node.data?.triggerType === 'webhook' &&
        node.data?.triggerConfig?.provider === event.provider &&
        node.data?.triggerConfig?.eventType === event.eventType
    })
    
    if (!triggerNode) {
      console.log(`   ❌ No matching trigger found`)
      return false
    }
    
    console.log(`   ✅ Found matching trigger!`)
    
    // Apply custom filters if configured
    return applyTriggerFilters(triggerNode, event)
  }) || []
  
  console.log(`🎯 Found ${matchingWorkflows.length} matching workflows`)
  return matchingWorkflows
}

/**
 * Apply custom trigger filters (e.g., sender, subject, etc.)
 */
function applyTriggerFilters(triggerNode: any, event: WebhookEvent): boolean {
  const config = triggerNode.data?.triggerConfig || {}
  
  // Gmail specific filters
  if (event.provider === 'gmail') {
    if (config.sender_filter && event.eventData.from) {
      if (!event.eventData.from.includes(config.sender_filter)) {
        return false
      }
    }
    
    if (config.subject_filter && event.eventData.subject) {
      if (!event.eventData.subject.toLowerCase().includes(config.subject_filter.toLowerCase())) {
        return false
      }
    }
    
    if (config.has_attachments && event.eventData.attachments) {
      if (config.has_attachments === 'true' && !event.eventData.attachments?.length) {
        return false
      }
    }
  }
  
  // Discord specific filters
  if (event.provider === 'discord') {
    if (config.channel_filter && event.eventData.channel_id) {
      if (event.eventData.channel_id !== config.channel_filter) {
        return false
      }
    }
    
    if (config.user_filter && event.eventData.author?.id) {
      if (event.eventData.author.id !== config.user_filter) {
        return false
      }
    }
  }
  
  // Add more provider-specific filters as needed
  
  return true
}

/**
 * Execute workflow instantly with webhook data
 */
async function executeWorkflowInstantly(workflow: any, event: WebhookEvent): Promise<any> {
  try {
    const executionEngine = new AdvancedExecutionEngine()
    
    // Create execution session with webhook context
    const executionSession = await executionEngine.createExecutionSession(
      workflow.id,
      workflow.user_id,
      'webhook',
      {
        webhookEvent: event,
        inputData: event.eventData,
        triggerData: event.eventData,
        timestamp: event.timestamp
      }
    )
    
    // Execute workflow with webhook data as input
    const result = await executionEngine.executeWorkflowAdvanced(
      executionSession.id,
      event.eventData, // This becomes available as 'data' in action nodes
      {
        enableParallel: true,
        maxConcurrency: 5
      }
    )
    
    console.log(`✅ Workflow "${workflow.name}" executed successfully with webhook data`)
    return result
    
  } catch (error) {
    console.error(`❌ Failed to execute workflow "${workflow.name}":`, error)
    throw error
  }
}

/**
 * Store webhook event for audit trail
 */
async function storeWebhookEvent(event: WebhookEvent): Promise<void> {
  try {
    const supabase = await createSupabaseServiceClient()
    await supabase
      .from('webhook_events')
      .insert({
        provider: event.provider,
        service: event.service,
        event_data: event.eventData,
        request_id: event.requestId,
        status: 'received',
        timestamp: event.timestamp
      })
  } catch (error) {
    console.error('Failed to store webhook event:', error)
    // Don't throw - this shouldn't block execution
  }
}

// Provider-specific processors
export async function processDiscordEvent(event: WebhookEvent): Promise<any> {
  console.log('Processing Discord message:', event.eventData.content)
  return await processWebhookEvent(event)
}

export async function processSlackEvent(event: WebhookEvent): Promise<any> {
  console.log('Processing Slack message:', event.eventData.text)
  return await processWebhookEvent(event)
}

export async function processGitHubEvent(event: WebhookEvent): Promise<any> {
  console.log('Processing GitHub event:', event.eventType)
  return await processWebhookEvent(event)
}

export async function processNotionEvent(event: WebhookEvent): Promise<any> {
  console.log('Processing Notion event:', event.eventType)
  return await processWebhookEvent(event)
} 