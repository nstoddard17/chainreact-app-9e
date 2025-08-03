import { createSupabaseServiceClient } from '@/utils/supabase/server'

export interface WebhookTask {
  provider: string
  service?: string
  eventType?: string
  eventData: any
  requestId: string
  priority?: 'high' | 'normal' | 'low'
}

export async function queueWebhookTask(task: WebhookTask): Promise<void> {
  try {
    const supabase = await createSupabaseServiceClient()
    
    // Store the task in the database for background processing
    await supabase
      .from('webhook_tasks')
      .insert({
        provider: task.provider,
        service: task.service,
        event_type: task.eventType,
        event_data: task.eventData,
        request_id: task.requestId,
        priority: task.priority || 'normal',
        status: 'queued',
        created_at: new Date().toISOString()
      })

    console.log(`[Task Queue] Queued ${task.provider} webhook task:`, task.requestId)
  } catch (error) {
    console.error('Failed to queue webhook task:', error)
    // Don't throw - we don't want to fail the webhook processing if queuing fails
  }
}

export async function processWebhookTasks(): Promise<void> {
  try {
    const supabase = await createSupabaseServiceClient()
    
    // Get pending tasks, ordered by priority and creation time
    const { data: tasks, error } = await supabase
      .from('webhook_tasks')
      .select('*')
      .eq('status', 'queued')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10) // Process 10 tasks at a time

    if (error) {
      console.error('Failed to fetch webhook tasks:', error)
      return
    }

    if (!tasks || tasks.length === 0) {
      return
    }

    console.log(`[Task Queue] Processing ${tasks.length} webhook tasks`)

    // Process each task
    for (const task of tasks) {
      try {
        // Mark task as processing
        await supabase
          .from('webhook_tasks')
          .update({ 
            status: 'processing',
            started_at: new Date().toISOString()
          })
          .eq('id', task.id)

        // Process the task based on provider
        const result = await processTask(task)

        // Mark task as completed
        await supabase
          .from('webhook_tasks')
          .update({ 
            status: 'completed',
            result: result,
            completed_at: new Date().toISOString()
          })
          .eq('id', task.id)

        console.log(`[Task Queue] Completed task ${task.id}`)
      } catch (error) {
        console.error(`[Task Queue] Failed to process task ${task.id}:`, error)
        
        // Mark task as failed
        await supabase
          .from('webhook_tasks')
          .update({ 
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            failed_at: new Date().toISOString()
          })
          .eq('id', task.id)
      }
    }
  } catch (error) {
    console.error('Error processing webhook tasks:', error)
  }
}

async function processTask(task: any): Promise<any> {
  // Process the task based on provider and event type
  switch (task.provider) {
    case 'gmail':
      return await processGmailTask(task)
    case 'google':
      return await processGoogleTask(task)
    case 'discord':
      return await processDiscordTask(task)
    case 'slack':
      return await processSlackTask(task)
    case 'github':
      return await processGitHubTask(task)
    case 'notion':
      return await processNotionTask(task)
    default:
      return await processGenericTask(task)
  }
}

async function processGmailTask(task: any): Promise<any> {
  // Process Gmail-specific background tasks
  if (task.event_type === 'message.new') {
    // Fetch full message details from Gmail API
    console.log('Processing Gmail new message task:', task.request_id)
    return { processed: true, type: 'gmail_message_fetched' }
  }
  
  return { processed: true, type: 'gmail_task' }
}

async function processGoogleTask(task: any): Promise<any> {
  // Process Google-specific background tasks
  console.log('Processing Google task:', task.service, task.event_type)
  return { processed: true, type: 'google_task', service: task.service }
}

async function processDiscordTask(task: any): Promise<any> {
  // Process Discord-specific background tasks
  console.log('Processing Discord task:', task.event_type)
  return { processed: true, type: 'discord_task' }
}

async function processSlackTask(task: any): Promise<any> {
  // Process Slack-specific background tasks
  console.log('Processing Slack task:', task.event_type)
  return { processed: true, type: 'slack_task' }
}

async function processGitHubTask(task: any): Promise<any> {
  // Process GitHub-specific background tasks
  console.log('Processing GitHub task:', task.event_type)
  return { processed: true, type: 'github_task' }
}

async function processNotionTask(task: any): Promise<any> {
  // Process Notion-specific background tasks
  console.log('Processing Notion task:', task.event_type)
  return { processed: true, type: 'notion_task' }
}

async function processGenericTask(task: any): Promise<any> {
  // Process generic background tasks
  console.log('Processing generic task:', task.provider)
  return { processed: true, type: 'generic_task', provider: task.provider }
}

// Function to be called by a cron job or background worker
export async function runWebhookTaskProcessor(): Promise<void> {
  console.log('[Task Queue] Starting webhook task processor')
  await processWebhookTasks()
  console.log('[Task Queue] Completed webhook task processor')
} 