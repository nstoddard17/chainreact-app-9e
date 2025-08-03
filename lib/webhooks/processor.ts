import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { queueWebhookTask } from '@/lib/webhooks/task-queue'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'

export interface WebhookEvent {
  provider: string
  eventData: any
  requestId: string
}

export async function processWebhookEvent(event: WebhookEvent): Promise<any> {
  try {
    const supabase = await createSupabaseServiceClient()
    
    // Store the webhook event in the database
    const { data: storedEvent, error: storeError } = await supabase
      .from('webhook_events')
      .insert({
        provider: event.provider,
        event_data: event.eventData,
        request_id: event.requestId,
        status: 'received',
        timestamp: new Date().toISOString()
      })
      .select()
      .single()

    if (storeError) {
      console.error('Failed to store webhook event:', storeError)
    }

    // IMMEDIATELY trigger workflows that match this webhook event
    await triggerMatchingWorkflows(event)

    // Process based on provider
    switch (event.provider) {
      case 'discord':
        return await processDiscordEvent(event)
      case 'slack':
        return await processSlackEvent(event)
      case 'github':
        return await processGitHubEvent(event)
      case 'notion':
        return await processNotionEvent(event)
      default:
        return await processGenericEvent(event)
    }
  } catch (error) {
    console.error('Error processing webhook event:', error)
    throw error
  }
}

async function triggerMatchingWorkflows(event: WebhookEvent): Promise<void> {
  try {
    const supabase = await createSupabaseServiceClient()
    
    // Find all active workflows with webhook triggers that match this event
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

    // Find workflows with webhook triggers that match this event
    const matchingWorkflows = workflows.filter(workflow => {
      const nodes = workflow.nodes || []
      return nodes.some((node: any) => {
        if (!node.data?.isTrigger || node.data?.triggerType !== 'webhook') {
          return false
        }
        
        // Check if the webhook trigger matches this event
        const triggerConfig = node.data.triggerConfig || {}
        return (
          triggerConfig.provider === event.provider &&
          triggerConfig.eventType === event.eventData.type
        )
      })
    })

    console.log(`Found ${matchingWorkflows.length} workflows matching webhook event:`, {
      provider: event.provider,
      eventType: event.eventData.type
    })

    // Trigger each matching workflow
    for (const workflow of matchingWorkflows) {
      try {
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
        
        console.log(`Triggered workflow ${workflow.name} (${workflow.id}) with session ${executionSession.id}`)
      } catch (workflowError) {
        console.error(`Failed to trigger workflow ${workflow.id}:`, workflowError)
      }
    }
  } catch (error) {
    console.error('Error triggering matching workflows:', error)
  }
}

async function processDiscordEvent(event: WebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different Discord event types
  switch (eventData.type) {
    case 'MESSAGE_CREATE':
      return await handleDiscordMessage(eventData)
    case 'GUILD_MEMBER_ADD':
      return await handleDiscordMemberJoin(eventData)
    case 'GUILD_MEMBER_REMOVE':
      return await handleDiscordMemberLeave(eventData)
    default:
      console.log('Unhandled Discord event type:', eventData.type)
      return { processed: true, eventType: eventData.type }
  }
}

async function processSlackEvent(event: WebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different Slack event types
  switch (eventData.type) {
    case 'message':
      return await handleSlackMessage(eventData)
    case 'channel_created':
      return await handleSlackChannelCreated(eventData)
    case 'team_join':
      return await handleSlackTeamJoin(eventData)
    default:
      console.log('Unhandled Slack event type:', eventData.type)
      return { processed: true, eventType: eventData.type }
  }
}

async function processGitHubEvent(event: WebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different GitHub event types
  switch (eventData.action) {
    case 'created':
      return await handleGitHubIssueCreated(eventData)
    case 'opened':
      return await handleGitHubPullRequestOpened(eventData)
    case 'push':
      return await handleGitHubPush(eventData)
    default:
      console.log('Unhandled GitHub event action:', eventData.action)
      return { processed: true, eventAction: eventData.action }
  }
}

async function processNotionEvent(event: WebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different Notion event types
  switch (eventData.type) {
    case 'page.created':
      return await handleNotionPageCreated(eventData)
    case 'page.updated':
      return await handleNotionPageUpdated(eventData)
    case 'database.created':
      return await handleNotionDatabaseCreated(eventData)
    default:
      console.log('Unhandled Notion event type:', eventData.type)
      return { processed: true, eventType: eventData.type }
  }
}

async function processGenericEvent(event: WebhookEvent): Promise<any> {
  // Generic event processing
  console.log('Processing generic webhook event:', event.provider)
  
  // Queue for background processing if needed
  await queueWebhookTask({
    provider: event.provider,
    eventData: event.eventData,
    requestId: event.requestId
  })
  
  return { processed: true, provider: event.provider }
}

// Discord event handlers
async function handleDiscordMessage(eventData: any): Promise<any> {
  console.log('Processing Discord message:', eventData.content)
  return { processed: true, type: 'discord_message' }
}

async function handleDiscordMemberJoin(eventData: any): Promise<any> {
  console.log('Processing Discord member join:', eventData.user?.username)
  return { processed: true, type: 'discord_member_join' }
}

async function handleDiscordMemberLeave(eventData: any): Promise<any> {
  console.log('Processing Discord member leave:', eventData.user?.username)
  return { processed: true, type: 'discord_member_leave' }
}

// Slack event handlers
async function handleSlackMessage(eventData: any): Promise<any> {
  console.log('Processing Slack message:', eventData.text)
  return { processed: true, type: 'slack_message' }
}

async function handleSlackChannelCreated(eventData: any): Promise<any> {
  console.log('Processing Slack channel created:', eventData.channel?.name)
  return { processed: true, type: 'slack_channel_created' }
}

async function handleSlackTeamJoin(eventData: any): Promise<any> {
  console.log('Processing Slack team join:', eventData.user?.name)
  return { processed: true, type: 'slack_team_join' }
}

// GitHub event handlers
async function handleGitHubIssueCreated(eventData: any): Promise<any> {
  console.log('Processing GitHub issue created:', eventData.issue?.title)
  return { processed: true, type: 'github_issue_created' }
}

async function handleGitHubPullRequestOpened(eventData: any): Promise<any> {
  console.log('Processing GitHub PR opened:', eventData.pull_request?.title)
  return { processed: true, type: 'github_pr_opened' }
}

async function handleGitHubPush(eventData: any): Promise<any> {
  console.log('Processing GitHub push:', eventData.ref)
  return { processed: true, type: 'github_push' }
}

// Notion event handlers
async function handleNotionPageCreated(eventData: any): Promise<any> {
  console.log('Processing Notion page created:', eventData.page_id)
  return { processed: true, type: 'notion_page_created' }
}

async function handleNotionPageUpdated(eventData: any): Promise<any> {
  console.log('Processing Notion page updated:', eventData.page_id)
  return { processed: true, type: 'notion_page_updated' }
}

async function handleNotionDatabaseCreated(eventData: any): Promise<any> {
  console.log('Processing Notion database created:', eventData.database_id)
  return { processed: true, type: 'notion_database_created' }
} 