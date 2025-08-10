import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
import { MicrosoftGraphClient } from '@/lib/microsoft-graph/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

export async function POST(_req: NextRequest) {
  // Simple pull worker: process oldest pending items
  const { data: rows } = await supabase
    .from('microsoft_webhook_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(25)

  if (!rows || rows.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let processed = 0
  for (const row of rows) {
    try {
      await supabase
        .from('microsoft_webhook_queue')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', row.id)

      // Get user token for API calls
      const { data: userToken } = await supabase
        .from('microsoft_graph_subscriptions')
        .select('user_id, access_token')
        .eq('id', row.subscription_id)
        .single()

      if (!userToken) {
        throw new Error('Subscription or token not found')
      }

      // Process based on resource type
      const payload = row.payload
      const resourceType = getResourceType(payload.resource)
      const events = await fetchResourceChanges(resourceType, payload, userToken.access_token)

      // Store normalized events
      if (events && events.length > 0) {
        await storeNormalizedEvents(events, userToken.user_id)
        
        // Emit workflow triggers for each event
        for (const event of events) {
          await emitWorkflowTrigger(event, userToken.user_id)
        }
      }

      // Mark as done
      await supabase
        .from('microsoft_webhook_queue')
        .update({ 
          status: 'done', 
          processed_count: events?.length || 0,
          updated_at: new Date().toISOString() 
        })
        .eq('id', row.id)

      processed++
    } catch (e: any) {
      console.error('Error processing webhook queue item:', e)
      await supabase
        .from('microsoft_webhook_queue')
        .update({ 
          status: 'error', 
          error_message: e.message, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', row.id)
    }
  }

  return NextResponse.json({ processed })
}

// Helper functions
function getResourceType(resource: string): string {
  if (resource.includes('/drive/') || resource.includes('/drives/')) {
    return 'onedrive'
  } else if (resource.includes('/messages')) {
    return 'mail'
  } else if (resource.includes('/events')) {
    return 'calendar'
  } else if (resource.includes('/teams/') || resource.includes('/channels/')) {
    return 'teams'
  } else if (resource.includes('/chats/')) {
    return 'chat'
  } else if (resource.includes('/onenote/')) {
    return 'onenote'
  }
  return 'unknown'
}

async function fetchResourceChanges(
  resourceType: string, 
  payload: any, 
  accessToken: string
): Promise<any[]> {
  const client = new MicrosoftGraphClient({
    accessToken,
    decryptionKey: process.env.MICROSOFT_TEAMS_PRIVATE_KEY,
    decryptionCert: process.env.MICROSOFT_TEAMS_CERTIFICATE
  })

  // Get delta token from database or use default
  const { data: deltaToken } = await supabase
    .from('microsoft_graph_delta_tokens')
    .select('token')
    .eq('resource_type', resourceType)
    .eq('resource_id', payload.resource)
    .maybeSingle()

  let events: any[] = []
  let newDeltaToken: string | undefined

  try {
    switch (resourceType) {
      case 'onedrive': {
        // Extract drive ID if present
        const driveIdMatch = payload.resource.match(/drives\/([^/]+)/)
        const driveId = driveIdMatch ? driveIdMatch[1] : undefined
        
        const response = await client.getOneDriveDelta(driveId, deltaToken?.token)
        events = response.value.filter(item => item._normalized).map(item => item._normalized!)
        newDeltaToken = response['@odata.deltaLink']?.split('token=')[1]
        break
      }
      
      case 'mail': {
        const response = await client.getMailDelta(deltaToken?.token)
        events = response.value.filter(item => item._normalized).map(item => item._normalized!)
        newDeltaToken = response['@odata.deltaLink']?.split('$deltatoken=')[1]
        break
      }
      
      case 'calendar': {
        const response = await client.getCalendarDelta(deltaToken?.token)
        events = response.value.filter(item => item._normalized).map(item => item._normalized!)
        newDeltaToken = response['@odata.deltaLink']?.split('$deltatoken=')[1]
        break
      }
      
      case 'teams': {
        // Extract team and channel IDs
        const teamMatch = payload.resource.match(/teams\/([^/]+)/)
        const channelMatch = payload.resource.match(/channels\/([^/]+)/)
        
        if (teamMatch && channelMatch) {
          const teamId = teamMatch[1]
          const channelId = channelMatch[1]
          
          // Get last processed date or default to 24h ago
          const lastProcessed = deltaToken?.token 
            ? new Date(deltaToken.token) 
            : new Date(Date.now() - 24 * 60 * 60 * 1000)
          
          const response = await client.getTeamsMessages(teamId, channelId, lastProcessed)
          events = response.value.filter(item => item._normalized).map(item => item._normalized!)
          newDeltaToken = new Date().toISOString() // Use current time as token for teams
        }
        break
      }
      
      case 'chat': {
        // Extract chat ID
        const chatMatch = payload.resource.match(/chats\/([^/]+)/)
        
        if (chatMatch) {
          const chatId = chatMatch[1]
          
          // Get last processed date or default to 24h ago
          const lastProcessed = deltaToken?.token 
            ? new Date(deltaToken.token) 
            : new Date(Date.now() - 24 * 60 * 60 * 1000)
          
          const response = await client.getChatMessages(chatId, lastProcessed)
          events = response.value.filter(item => item._normalized).map(item => item._normalized!)
          newDeltaToken = new Date().toISOString() // Use current time as token for chats
        }
        break
      }
      
      case 'onenote': {
        // For OneNote, we use OneDrive delta for change tracking
        // Get notebooks to find corresponding OneDrive items
        const notebooks = await client.getOneNoteNotebooks()
        
        // For each notebook, get pages
        for (const notebook of notebooks.value) {
          const pages = await client.getOneNotePagesDelta(notebook.id, deltaToken?.token)
          
          // Add normalized events
          const normalizedPages = pages.value.map(page => ({
            id: page.id,
            type: 'onenote_page' as const,
            action: 'updated',
            title: page.title,
            lastModified: page.lastModifiedDateTime,
            webUrl: page.links.oneNoteWebUrl.href,
            originalPayload: page
          }))
          
          events.push(...normalizedPages)
        }
        
        // Use current time as token for OneNote
        newDeltaToken = new Date().toISOString()
        break
      }
    }

    // Store new delta token if available
    if (newDeltaToken) {
      await supabase
        .from('microsoft_graph_delta_tokens')
        .upsert({
          resource_type: resourceType,
          resource_id: payload.resource,
          token: newDeltaToken,
          updated_at: new Date().toISOString()
        }, { onConflict: 'resource_type,resource_id' })
    }

    return events
  } catch (error) {
    console.error(`Error fetching ${resourceType} changes:`, error)
    throw error
  }
}

async function storeNormalizedEvents(events: any[], userId: string): Promise<void> {
  if (!events.length) return

  // Batch insert events
  const eventsToInsert = events.map(event => ({
    user_id: userId,
    event_type: event.type,
    event_action: event.action,
    event_id: event.id,
    resource_id: event.id,
    payload: event,
    created_at: new Date().toISOString()
  }))

  await supabase.from('microsoft_graph_events').insert(eventsToInsert)
}

async function emitWorkflowTrigger(event: any, userId: string): Promise<void> {
  // Find workflows that should be triggered by this event
  const { data: workflows } = await supabase
    .from('workflows')
    .select('id, nodes')
    .eq('status', 'active')
    .or(`user_id.eq.${userId},team_id.in.(select team_id from team_members where user_id='${userId}')`)

  if (!workflows || workflows.length === 0) return

  // Check each workflow for matching triggers
  for (const workflow of workflows) {
    try {
      const nodes = JSON.parse(workflow.nodes || '[]')
      
      // Find trigger nodes that match this event type
      const triggerNodes = nodes.filter((node: any) => {
        if (!node.type?.startsWith('microsoft_graph_')) return false
        
        // Match based on event type and action
        switch (event.type) {
          case 'onedrive_item':
            return node.type.includes('onedrive') && 
                  (!node.data?.actions || node.data.actions.includes(event.action))
          
          case 'outlook_mail':
            return node.type.includes('mail') && 
                  (!node.data?.actions || node.data.actions.includes(event.action))
          
          case 'outlook_calendar':
            return node.type.includes('calendar') && 
                  (!node.data?.actions || node.data.actions.includes(event.action))
          
          case 'teams_message':
            return (node.type.includes('teams') || node.type.includes('chat')) && 
                  (!node.data?.actions || node.data.actions.includes(event.action))
          
          case 'onenote_page':
            return node.type.includes('onenote') && 
                  (!node.data?.actions || node.data.actions.includes(event.action))
          
          default:
            return false
        }
      })
      
      // If we found matching triggers, execute the workflow
      if (triggerNodes.length > 0) {
        const executionEngine = new (await import('@/lib/execution/advancedExecutionEngine')).AdvancedExecutionEngine()
        
        await executionEngine.executeWorkflow(workflow.id, {
          triggerData: {
            event,
            source: 'microsoft-graph-worker',
            timestamp: new Date().toISOString()
          }
        })
      }
    } catch (error) {
      console.error(`Error processing workflow ${workflow.id} for event:`, error)
    }
  }
}