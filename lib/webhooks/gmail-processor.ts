import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { queueWebhookTask } from '@/lib/webhooks/task-queue'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'

export interface GmailWebhookEvent {
  eventData: any
  requestId: string
}

export async function processGmailEvent(event: GmailWebhookEvent): Promise<any> {
  try {
    console.log('🔍 [Gmail Processor] Processing Gmail event:', {
      eventType: event.eventData.type,
      emailAddress: event.eventData.emailAddress,
      historyId: event.eventData.historyId
    })

    const supabase = await createSupabaseServiceClient()

    // Store the webhook event in the database
    const { data: storedEvent, error: storeError } = await supabase
      .from('webhook_events')
      .insert({
        provider: 'gmail',
        service: 'gmail',
        event_data: event.eventData,
        request_id: event.requestId,
        status: 'received',
        timestamp: new Date().toISOString()
      })
      .select()
      .single()

    if (storeError) {
      console.error('Failed to store Gmail webhook event:', storeError)
    }

    // IMMEDIATELY trigger workflows that match this Gmail event
    await triggerMatchingGmailWorkflows(event)

    // Process Gmail event
    return await processGmailEventData(event)
  } catch (error) {
    console.error('Error processing Gmail webhook event:', error)
    throw error
  }
}

async function processGmailEventData(event: GmailWebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different Gmail event types
  switch (eventData.type) {
    case 'message.new':
      return await handleGmailNewMessage(eventData)
    case 'message.modified':
      return await handleGmailMessageModified(eventData)
    case 'message.deleted':
      return await handleGmailMessageDeleted(eventData)
    case 'label.added':
      return await handleGmailLabelAdded(eventData)
    case 'label.removed':
      return await handleGmailLabelRemoved(eventData)
    case 'attachment.added':
      return await handleGmailAttachmentAdded(eventData)
    default:
      console.log('Unhandled Gmail event type:', eventData.type)
      return { processed: true, eventType: eventData.type }
  }
}

// Gmail event handlers
async function handleGmailNewMessage(eventData: any): Promise<any> {
  console.log('Processing Gmail new message:', eventData.message_id)
  
  // Queue for background processing to fetch full message details
  await queueWebhookTask({
    provider: 'gmail',
    service: 'gmail',
    eventType: 'message.new',
    eventData: eventData,
    requestId: eventData.requestId
  })
  
  return { 
    processed: true, 
    type: 'gmail_new_message', 
    messageId: eventData.message_id,
    threadId: eventData.thread_id
  }
}

async function handleGmailMessageModified(eventData: any): Promise<any> {
  console.log('Processing Gmail message modified:', eventData.message_id)
  return { 
    processed: true, 
    type: 'gmail_message_modified', 
    messageId: eventData.message_id 
  }
}

async function handleGmailMessageDeleted(eventData: any): Promise<any> {
  console.log('Processing Gmail message deleted:', eventData.message_id)
  return { 
    processed: true, 
    type: 'gmail_message_deleted', 
    messageId: eventData.message_id 
  }
}

async function handleGmailLabelAdded(eventData: any): Promise<any> {
  console.log('Processing Gmail label added:', eventData.label_id)
  return { 
    processed: true, 
    type: 'gmail_label_added', 
    labelId: eventData.label_id,
    messageId: eventData.message_id
  }
}

async function handleGmailLabelRemoved(eventData: any): Promise<any> {
  console.log('Processing Gmail label removed:', eventData.label_id)
  return { 
    processed: true, 
    type: 'gmail_label_removed', 
    labelId: eventData.label_id,
    messageId: eventData.message_id
  }
}

async function handleGmailAttachmentAdded(eventData: any): Promise<any> {
  console.log('Processing Gmail attachment added:', eventData.attachment_id)
  return { 
    processed: true, 
    type: 'gmail_attachment_added', 
    attachmentId: eventData.attachment_id,
    messageId: eventData.message_id
  }
}

async function triggerMatchingGmailWorkflows(event: GmailWebhookEvent): Promise<void> {
  try {
    console.log('🚀 [Gmail Processor] Starting to find matching workflows for Gmail event')
    const supabase = await createSupabaseServiceClient()

    // Find all active workflows with Gmail webhook triggers
    const { data: workflows, error } = await supabase
      .from('workflows')
      .select(`
        id,
        user_id,
        nodes,
        name
      `)
      .eq('status', 'active')
      .not('nodes', 'is', null)

    if (error) {
      console.error('Failed to fetch workflows:', error)
      return
    }

    if (!workflows) return

    // Find workflows with Gmail webhook triggers that match this event
    const matchingWorkflows = workflows.filter(workflow => {
      const nodes = workflow.nodes || []
      return nodes.some((node: any) => {
        // Check for Gmail triggers
        const isGmailTrigger =
          node.data?.type === 'gmail_trigger_new_email' ||
          node.data?.nodeType === 'gmail_trigger_new_email' ||
          node.type === 'gmail_trigger_new_email' ||
          node.data?.providerId === 'gmail'

        if (!node.data?.isTrigger || !isGmailTrigger) {
          return false
        }

        console.log(`[Gmail Processor] Found Gmail trigger node in workflow ${workflow.id}:`, {
          nodeId: node.id,
          nodeType: node.data?.type || node.data?.nodeType || node.type,
          config: node.data?.config
        })

        // For now, match any Gmail trigger
        // TODO: Check specific email filters (sender, subject, etc.)
        return true
      })
    })

    console.log(`📊 Found ${matchingWorkflows.length} workflows matching Gmail event:`, {
      eventType: event.eventData.type,
      workflowIds: matchingWorkflows.map(w => ({ id: w.id, name: w.name }))
    })

    // Trigger each matching workflow
    for (const workflow of matchingWorkflows) {
      try {
        console.log(`🎯 Triggering workflow: "${workflow.name}" (${workflow.id})`)

        const executionEngine = new AdvancedExecutionEngine()
        const executionSession = await executionEngine.createExecutionSession(
          workflow.id,
          workflow.user_id,
          'webhook',
          {
            inputData: event.eventData,
            webhookEvent: event
          }
        )

        // Execute the workflow asynchronously (don't wait for completion)
        executionEngine.executeWorkflowAdvanced(executionSession.id, event.eventData)

        console.log(`✅ Successfully triggered workflow ${workflow.name} (${workflow.id}) with session ${executionSession.id}`)
      } catch (workflowError) {
        console.error(`Failed to trigger workflow ${workflow.id}:`, workflowError)
      }
    }
  } catch (error) {
    console.error('Error triggering matching Gmail workflows:', error)
  }
} 