import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
import { MicrosoftGraphClient } from '@/lib/microsoft-graph/client'
import { safeDecrypt, encrypt } from '@/lib/security/encryption'
import { flagIntegrationWorkflows } from '@/lib/integrations/integrationWorkflowManager'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

// Track processed events to prevent duplicate processing
const recentlyProcessedEvents = new Map<string, number>()
const EVENT_DEDUPE_WINDOW = 60000 // 60 seconds

let workerCallCount = 0

export async function POST(_req: NextRequest) {
  workerCallCount++
  console.log(`\n🏃 Worker called (call #${workerCallCount})`)

  // Simple pull worker: process oldest pending items
  const { data: rows } = await supabase
    .from('microsoft_webhook_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(25)

  console.log('🔍 Worker queue check:', {
    pendingItems: rows?.length || 0,
    totalInQueue: (await supabase.from('microsoft_webhook_queue').select('id', { count: 'exact' })).count || 0,
    recentItems: rows?.slice(0, 3).map(r => ({
      id: r.id,
      resource: r.resource,
      changeType: r.change_type,
      status: r.status,
      createdAt: r.created_at
    })) || []
  })

  if (!rows || rows.length === 0) {
    console.log('⚠️ No events to process from webhook')
    return NextResponse.json({ processed: 0 })
  }

  let processed = 0
  for (const row of rows) {
    try {
      await supabase
        .from('microsoft_webhook_queue')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', row.id)

      // Get subscription owner for API calls
      const { data: userToken } = await supabase
        .from('microsoft_graph_subscriptions')
        .select('user_id, access_token')
        .eq('id', row.subscription_id)
        .single()

      // If no user_id in subscription, try to get from the integration
      let actualUserId = userToken?.user_id
      if (!actualUserId) {
        console.log('⚠️ No user_id in subscription, attempting to find from integration...')
        // Find the OneDrive integration that matches this subscription
        const { data: integrations } = await supabase
          .from('integrations')
          .select('user_id, metadata')
          .eq('provider', 'onedrive')
          .eq('status', 'connected')

        // Look for integration with this subscription ID in metadata
        for (const integration of integrations || []) {
          let metadata = integration.metadata || {}
          if (typeof metadata === 'string') {
            try { metadata = JSON.parse(metadata) } catch { metadata = {} }
          }
          if (metadata.subscriptionId === row.subscription_id) {
            actualUserId = integration.user_id
            console.log('✅ Found user_id from integration:', actualUserId)
            break
          }
        }
      }

      if (!actualUserId) {
        console.error('❌ Could not determine user_id for subscription:', row.subscription_id)
        continue
      }

      if (!userToken) {
        throw new Error('Subscription or token not found')
      }

      // Process based on resource type
      const payload = row.payload
      const resourceType = getResourceType(payload.resource)
      console.log('🔍 Processing webhook for resource type:', resourceType, 'from resource:', payload.resource)
      console.log('📋 Webhook payload details:', {
        resource: payload.resource,
        changeType: payload.changeType,
        subscriptionId: payload.subscriptionId,
        resourceData: payload.resourceData
      })

      let events: any[] = []
      
      // Check if this is an individual resource (not a collection)
      const isIndividualResource = isIndividualMessageResource(payload.resource) || 
                                   isIndividualDriveResource(payload.resource) ||
                                   isIndividualEventResource(payload.resource)
      
      if (isIndividualResource) {
        console.log('🎯 Individual resource detected, fetching directly')
        events = await fetchIndividualResource(payload, userToken.access_token)
      } else if (resourceType === 'onedrive') {
        events = await fetchOneDriveChanges(payload, userToken.user_id)
      } else {
        // Fallback to generic handler for other resource types
        console.log('🔄 Using generic handler for resource type:', resourceType)
        events = await fetchResourceChanges(resourceType, payload, userToken.access_token)
      }

      console.log('📊 Fetched events:', {
        count: events?.length || 0,
        eventTypes: events?.map(e => ({ type: e.type, action: e.action, name: e.name })),
        resourceType,
        resource: payload.resource
      })

      // Store normalized events
      if (events && events.length > 0) {
        await storeNormalizedEvents(events, userToken.user_id)

        // Emit workflow triggers for each event
        for (const event of events) {
          // Deduplicate events - use more fields for uniqueness
          const eventKey = `${event.id}-${event.type}-${event.action}-${event.name || ''}`
          const now = Date.now()

          // Clean old entries
          for (const [key, timestamp] of recentlyProcessedEvents.entries()) {
            if (now - timestamp > EVENT_DEDUPE_WINDOW) {
              recentlyProcessedEvents.delete(key)
            }
          }

          // Skip if recently processed
          if (recentlyProcessedEvents.has(eventKey)) {
            console.log(`⏭️ Skipping duplicate event: ${event.id} (${event.type}/${event.action})`)
            continue
          }
          recentlyProcessedEvents.set(eventKey, now)

          console.log('🎯 Emitting workflow trigger for event:', {
            type: event.type,
            action: event.action,
            name: event.name,
            id: event.id
          })
          await emitWorkflowTrigger(event, actualUserId)
        }
      } else {
        console.log('⚠️ No events to process from webhook')
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
      try {
        const msg = typeof e?.message === 'string' ? e.message : ''
        if (msg.includes('InvalidAuthenticationToken') || msg.includes('No valid Microsoft Graph')) {
          await flagIntegrationWorkflows({
            integrationId: undefined,
            provider: 'onedrive',
            userId: row?.user_id || undefined,
            reason: 'Microsoft authentication expired while processing OneDrive webhook'
          })
        }
      } catch {}
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
  console.log('🔍 Determining resource type for:', resource)
  
  if (resource.includes('/drive/') || resource.includes('/drives/')) {
    console.log('📁 Detected OneDrive resource')
    return 'onedrive'
  } else if (resource.includes('/messages')) {
    console.log('📧 Detected mail resource')
    return 'mail'
  } else if (resource.includes('/events')) {
    console.log('📅 Detected calendar resource')
    return 'calendar'
  } else if (resource.includes('/teams/') || resource.includes('/channels/')) {
    console.log('💬 Detected Teams resource')
    return 'teams'
  } else if (resource.includes('/chats/')) {
    console.log('💬 Detected chat resource')
    return 'chat'
  } else if (resource.includes('/onenote/')) {
    console.log('📝 Detected OneNote resource')
    return 'onenote'
  }
  
  console.log('❓ Unknown resource type')
  return 'unknown'
}

function isIndividualMessageResource(resource: string): boolean {
  // Check if it's a specific message ID (not the collection)
  const messageIdMatch = resource.match(/\/me\/messages\/([^\/]+)$/)
  const folderMessageMatch = resource.match(/\/me\/mailFolders\/[^\/]+\/messages\/([^\/]+)$/)
  return !!(messageIdMatch || folderMessageMatch)
}

function isIndividualDriveResource(resource: string): boolean {
  // Check if it's a specific drive item ID (not the collection)
  const driveItemMatch = resource.match(/\/me\/drive\/items\/([^\/]+)$/)
  const driveItemPathMatch = resource.match(/\/drives\/[^\/]+\/items\/([^\/]+)$/)
  return !!(driveItemMatch || driveItemPathMatch)
}

function isIndividualEventResource(resource: string): boolean {
  // Check if it's a specific event ID (not the collection)
  const eventMatch = resource.match(/\/me\/events\/([^\/]+)$/)
  const calendarEventMatch = resource.match(/\/me\/calendars\/[^\/]+\/events\/([^\/]+)$/)
  return !!(eventMatch || calendarEventMatch)
}

async function fetchIndividualResource(payload: any, accessToken: string): Promise<any[]> {
  const client = new MicrosoftGraphClient({ accessToken })
  const resource = payload.resource
  const changeType = payload.changeType
  
  console.log('🎯 Fetching individual resource:', resource, 'changeType:', changeType)
  
  try {
    // For individual resources, fetch the specific item directly
    const item: any = await client.request(resource)
    
    if (!item) {
      console.log('⚠️ No item found for resource:', resource)
      return []
    }
    
    // Normalize based on resource type
    let normalizedEvent: any = null
    
    if (resource.includes('/messages')) {
      // Mail message
      normalizedEvent = {
        id: item.id,
        type: 'outlook_mail',
        action: changeType === 'deleted' ? 'deleted' : (item.isDraft ? 'draft' : 'created'),
        subject: item.subject,
        from: item.from?.emailAddress?.address,
        receivedDateTime: item.receivedDateTime,
        sentDateTime: item.sentDateTime,
        importance: item.importance,
        hasAttachments: item.hasAttachments,
        isRead: item.isRead,
        isDraft: item.isDraft,
        webLink: item.webLink,
        originalPayload: item
      }
    } else if (resource.includes('/drive/items') || resource.includes('/drives/')) {
      // OneDrive item
      normalizedEvent = {
        id: item.id,
        type: 'onedrive_item',
        action: item.deleted ? 'deleted' : (item.file ? 'file_updated' : 'folder_updated'),
        name: item.name,
        path: item.parentReference?.path ? `${item.parentReference.path}/${item.name}` : item.name,
        lastModified: item.lastModifiedDateTime,
        createdBy: item.createdBy?.user?.displayName,
        size: item.size,
        webUrl: item.webUrl,
        originalPayload: item
      }
    } else if (resource.includes('/events')) {
      // Calendar event
      normalizedEvent = {
        id: item.id,
        type: 'outlook_calendar',
        action: item.isCancelled ? 'cancelled' : (changeType === 'deleted' ? 'deleted' : (item.isNewEvent ? 'created' : 'updated')),
        subject: item.subject,
        start: item.start?.dateTime,
        end: item.end?.dateTime,
        organizer: item.organizer?.emailAddress?.address,
        location: item.location?.displayName,
        webLink: item.webLink,
        originalPayload: item
      }
    }
    
    if (normalizedEvent) {
      console.log('✅ Individual resource normalized:', {
        type: normalizedEvent.type,
        action: normalizedEvent.action,
        id: normalizedEvent.id
      })
      return [normalizedEvent]
    }
    
    return []
  } catch (error) {
    console.error('❌ Error fetching individual resource:', error)
    return []
  }
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
    console.log('🔄 Processing resource type:', resourceType, 'with delta token:', deltaToken?.token ? 'present' : 'none')
    
    switch (resourceType) {
      case 'onedrive': {
        // Extract drive ID if present
        const driveIdMatch = payload.resource.match(/drives\/([^/]+)/)
        const driveId = driveIdMatch ? driveIdMatch[1] : undefined
        
        console.log('📁 OneDrive delta query for drive:', driveId)
        const response = await client.getOneDriveDelta(driveId, deltaToken?.token)
        events = response.value.filter(item => item._normalized).map(item => item._normalized!)
        newDeltaToken = response['@odata.deltaLink']?.split('token=')[1]
        console.log('📁 OneDrive events found:', events.length)
        break
      }
      
      case 'mail': {
        console.log('📧 Mail delta query starting...')
        const response = await client.getMailDelta(deltaToken?.token)
        console.log('📧 Mail delta response:', {
          totalMessages: response.value.length,
          hasDeltaLink: !!response['@odata.deltaLink'],
          hasNextLink: !!response['@odata.nextLink']
        })
        
        events = response.value.filter(item => item._normalized).map(item => item._normalized!)
        
        // If no events from delta query, try to get recent messages as fallback
        if (events.length === 0 && !deltaToken?.token) {
          console.log('📧 No events from delta query, trying recent messages fallback...')
          try {
            const recentResponse: any = await client.request('/me/messages?$top=10&$orderby=receivedDateTime desc')
            if (recentResponse.value && recentResponse.value.length > 0) {
              console.log('📧 Found recent messages:', recentResponse.value.length)
              // Normalize recent messages
              const normalizedRecent = recentResponse.value.map((message: any) => ({
                id: message.id,
                type: 'outlook_mail',
                action: message.isDraft ? 'draft' : 'created',
                subject: message.subject,
                from: message.from?.emailAddress?.address,
                receivedDateTime: message.receivedDateTime,
                sentDateTime: message.sentDateTime,
                importance: message.importance,
                hasAttachments: message.hasAttachments,
                isRead: message.isRead,
                isDraft: message.isDraft,
                webLink: message.webLink,
                originalPayload: message
              }))
              events = normalizedRecent
            }
          } catch (fallbackError) {
            console.log('📧 Recent messages fallback failed:', fallbackError)
          }
        }
        
        // Parse delta token from the delta link
        const deltaLink = response['@odata.deltaLink']
        if (deltaLink) {
          const tokenMatch = deltaLink.match(/\$deltatoken=([^&]+)/)
          newDeltaToken = tokenMatch ? tokenMatch[1] : undefined
        }
        console.log('📧 Mail events found:', events.length)
        console.log('📧 New delta token:', newDeltaToken ? 'present' : 'none')
        if (events.length > 0) {
          console.log('📧 Sample mail event:', {
            type: events[0].type,
            action: events[0].action,
            subject: events[0].subject,
            from: events[0].from
          })
        }
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

// Track recently executed workflows to prevent duplicates
const recentWorkflowExecutions = new Map<string, number>()

async function emitWorkflowTrigger(event: any, userId: string, accessToken?: string): Promise<void> {
  // Deduplicate at the workflow trigger level
  const triggerKey = `${userId}-${event.id}-${event.type}-${event.action}`
  const now = Date.now()

  console.log('🔑 Workflow trigger key:', {
    key: triggerKey,
    eventId: event.id,
    type: event.type,
    action: event.action,
    name: event.name,
    timestamp: now
  })

  // Check if we've recently processed this exact trigger
  if (recentWorkflowExecutions.has(triggerKey)) {
    const lastRun = recentWorkflowExecutions.get(triggerKey)!
    const timeSince = now - lastRun
    console.log(`⚠️ Duplicate trigger detected:`, {
      triggerKey,
      lastRun,
      timeSince,
      willSkip: timeSince < 30000
    })
    if (timeSince < 30000) { // 30 second window
      console.log(`⏭️ SKIPPING duplicate workflow trigger (${timeSince}ms since last run)`)
      return
    }
  }
  recentWorkflowExecutions.set(triggerKey, now)

  // Clean old entries
  for (const [key, timestamp] of recentWorkflowExecutions.entries()) {
    if (now - timestamp > 60000) {
      recentWorkflowExecutions.delete(key)
    }
  }

  console.log('✅ Proceeding with workflow trigger (not a duplicate)')

  // First, check if user has any workflows at all
  const { data: allWorkflows, error: allError } = await supabase
    .from('workflows')
    .select('id, name, status, user_id')
    .eq('user_id', userId)

  if (allError) {
    console.error('❌ Error querying workflows:', allError)
  }

  // Also check without the OR condition to see if it's a query issue
  const { data: directWorkflows } = await supabase
    .from('workflows')
    .select('id, name, status, user_id')
    .eq('user_id', userId)

  // Debug: Check ALL workflows with OneDrive triggers
  const { data: allDbWorkflows } = await supabase
    .from('workflows')
    .select('id, name, status, user_id, nodes')
    .eq('status', 'active')
    .limit(10)

  const onedriveWorkflows = allDbWorkflows?.filter(w => {
    try {
      const nodes = typeof w.nodes === 'string'
        ? JSON.parse(w.nodes || '[]')
        : w.nodes || []
      return nodes.some((n: any) =>
        n?.data?.type?.includes('onedrive') ||
        n?.data?.providerId === 'onedrive'
      )
    } catch {
      return false
    }
  }) || []

  console.log('📊 User workflows overview:', {
    userId,
    totalWorkflows: allWorkflows?.length || 0,
    directWorkflows: directWorkflows?.length || 0,
    totalActiveInDb: allDbWorkflows?.length || 0,
    onedriveWorkflowsInDb: onedriveWorkflows.map(w => ({
      id: w.id,
      name: w.name,
      userId: w.user_id,
      matchesUser: w.user_id === userId
    })),
    workflowStatuses: allWorkflows?.map(w => ({ name: w.name, status: w.status, userId: w.user_id })) || [],
    queryError: allError
  })

  // Find workflows that should be triggered by this event
  const { data: workflows, error: workflowError } = await supabase
    .from('workflows')
    .select('id, nodes, name, status, user_id')
    .eq('status', 'active')
    .eq('user_id', userId)

  if (workflowError) {
    console.error('❌ Error fetching workflows:', workflowError)
  }

  // Also try a direct query without the team condition
  const { data: directUserWorkflows } = await supabase
    .from('workflows')
    .select('id, nodes, name, status, user_id')
    .eq('status', 'active')
    .eq('user_id', userId)

  console.log('🔎 Checking workflows for trigger match:', {
    workflowCount: workflows?.length || 0,
    directWorkflowCount: directUserWorkflows?.length || 0,
    eventType: event.type,
    eventAction: event.action,
    userId,
    activeWorkflows: workflows?.map(w => ({ name: w.name, userId: w.user_id })) || [],
    directWorkflows: directUserWorkflows?.map(w => ({ name: w.name, userId: w.user_id })) || [],
    error: workflowError
  })

  if (!workflows || workflows.length === 0) {
    console.log('❌ No active workflows found for user. Please ensure your workflows are activated (status = "active")')

    // Additional debug: Check what workflows exist in DB for this user
    const { data: allUserWorkflows } = await supabase
      .from('workflows')
      .select('id, name, status, user_id')
      .eq('user_id', userId)

    console.log('📊 All workflows for this user (regardless of status):', {
      userId,
      totalCount: allUserWorkflows?.length || 0,
      workflows: allUserWorkflows?.map(w => ({
        id: w.id,
        name: w.name,
        status: w.status,
        userId: w.user_id
      })) || []
    })

    return
  }

  const folderPathCache = new Map<string, string>()
  const client = accessToken ? new MicrosoftGraphClient({ accessToken }) : null

  // Check each workflow for matching triggers
  for (const workflow of workflows) {
    try {
      const nodes = typeof workflow.nodes === 'string'
        ? JSON.parse(workflow.nodes || '[]')
        : workflow.nodes || []

      // Debug node structure
      if (nodes.length > 0) {
        console.log('🔍 First node structure sample:', {
          type: nodes[0]?.type,
          dataType: nodes[0]?.data?.type,
          isTrigger: nodes[0]?.data?.isTrigger,
          providerId: nodes[0]?.data?.providerId,
          fullNode: JSON.stringify(nodes[0]).substring(0, 200)
        })
      }

      console.log(`📋 Checking workflow ${workflow.id}:`, {
        nodeCount: nodes.length,
        triggerNodes: nodes.filter((n: any) => {
          // Check both possible locations for trigger type
          const nodeType = n?.data?.type || n?.type
          const isTrigger = n?.data?.isTrigger ||
            nodeType?.includes('trigger') ||
            nodeType?.startsWith('microsoft_graph_')
          return isTrigger
        }).map((n: any) => ({
          type: n?.data?.type || n?.type,
          providerId: n?.data?.providerId,
          isTrigger: n?.data?.isTrigger
        }))
      })

      // Find trigger nodes that match this event type
      const triggerNodes = nodes.filter((node: any) => {
        const nodeType = node?.data?.type || node?.type

        // Log each node being checked
        if (nodeType?.includes('onedrive') || nodeType?.includes('trigger')) {
          console.log('🔎 Checking node:', {
            nodeType,
            eventType: event.type,
            dataType: node?.data?.type,
            isTrigger: node?.data?.isTrigger
          })
        }

        // Support existing microsoft_graph_* matching
        if (nodeType?.startsWith('microsoft_graph_')) {
          switch (event.type) {
            case 'onedrive_item':
              return nodeType.includes('onedrive') && (!node.data?.actions || node.data.actions.includes(event.action))
            case 'outlook_mail':
              return nodeType.includes('mail') && (!node.data?.actions || node.data.actions.includes(event.action))
            case 'outlook_calendar':
              return nodeType.includes('calendar') && (!node.data?.actions || node.data.actions.includes(event.action))
            case 'teams_message':
              return (nodeType.includes('teams') || nodeType.includes('chat')) && (!node.data?.actions || node.data.actions.includes(event.action))
            case 'onenote_page':
              return nodeType.includes('onenote') && (!node.data?.actions || node.data.actions.includes(event.action))
            default:
              return false
          }
        }

        // ChainReact OneDrive trigger support - check both locations
        if (nodeType === 'onedrive_trigger_new_file' ||
            nodeType === 'onedrive_trigger_file_modified') {
          console.log('✅ Found matching OneDrive trigger node:', nodeType)
          // Only trigger for actual file changes, not folder updates
          const isFileEvent = event.action === 'file_created' ||
                             event.action === 'file_updated' ||
                             event.action === 'deleted'
          if (event.type === 'onedrive_item' && !isFileEvent) {
            console.log('⏭️ Skipping folder update event for file trigger')
            return false
          }
          return event.type === 'onedrive_item'
        }

        // ChainReact Outlook email trigger support
        if (nodeType === 'microsoft-outlook_trigger_new_email') {
          console.log('✅ Found matching Outlook email trigger node:', nodeType)
          return event.type === 'outlook_mail' && (event.action === 'created' || event.action === 'draft')
        }

        if (nodeType === 'microsoft-outlook_trigger_email_sent') {
          console.log('✅ Found matching Outlook email sent trigger node:', nodeType)
          return event.type === 'outlook_mail' && (event.action === 'sent' || event.action === 'created')
        }

        return false
      })
      
      console.log(`✅ Found ${triggerNodes.length} matching trigger nodes`)

      // If we found matching triggers, execute the workflow
      if (triggerNodes.length > 0) {
        // For OneDrive triggers, apply per-node config filters before executing
        const onedriveNodes = triggerNodes.filter((n: any) =>

          n?.data?.type === 'onedrive_trigger_new_file' ||

          n?.data?.type === 'onedrive_trigger_file_modified'

        )

        const outlookNodes = triggerNodes.filter((n: any) => {

          const nodeType = n?.data?.type || n?.type

          return nodeType === 'microsoft-outlook_trigger_new_email' ||

                 nodeType === 'microsoft-outlook_trigger_email_sent'

        })

        const otherNodes = triggerNodes.filter((n: any) => {

          const nodeType = n?.data?.type || n?.type

          return nodeType !== 'onedrive_trigger_new_file' &&

                 nodeType !== 'onedrive_trigger_file_modified' &&

                 nodeType !== 'microsoft-outlook_trigger_new_email' &&

                 nodeType !== 'microsoft-outlook_trigger_email_sent'

        })



        console.log('dY"? Trigger type distribution:', {

          onedriveNodeCount: onedriveNodes.length,

          outlookNodeCount: outlookNodes.length,

          otherNodeCount: otherNodes.length,

          eventType: event.type,

          eventAction: event.action

        })



        const shouldTriggerFromOneDrive = async (): Promise<boolean> => {

          if (onedriveNodes.length === 0) return false

          if (event.type !== 'onedrive_item') return false



          const payload = event.originalPayload || {}

          const itemPath: string | null = payload?.parentReference?.path && payload?.name

            ? `${payload.parentReference.path}/${payload.name}`

            : null



          console.log('dY"? Checking OneDrive item:', {

            itemPath,

            isFile: Boolean(payload?.file),

            isFolder: Boolean(payload?.folder),

            createdAt: payload?.createdDateTime,

            modifiedAt: payload?.lastModifiedDateTime

          })



          for (const node of onedriveNodes) {

            const cfg = node?.data?.config || {}

            const folderId: string | undefined = cfg.folderId

            const includeSubfolders: boolean = cfg.includeSubfolders !== false

            const watchType: string = cfg.watchType || 'any'

            const fileType: string = cfg.fileType || 'any'

            const triggerOnUpdates: boolean = cfg.triggerOnUpdates === true



            let folderPath: string | null = null

            if (folderId && client) {

              if (folderPathCache.has(folderId)) {

                folderPath = folderPathCache.get(folderId)!

              } else {

                try {

                  const folderInfo: any = await client.request(`/me/drive/items/${folderId}`)

                  const basePath: string | null = folderInfo?.parentReference?.path || null

                  folderPath = basePath && folderInfo?.name ? `${basePath}/${folderInfo.name}` : null

                  if (folderPath) folderPathCache.set(folderId, folderPath)

                } catch {

                  folderPath = null

                }

              }

            }



            if (folderPath && itemPath) {

              const withinFolder = includeSubfolders ? itemPath.startsWith(folderPath) : itemPath === folderPath

              if (!withinFolder) continue

            } else if (folderPath && !itemPath) {

              continue

            }



            const isFile = Boolean(payload?.file)

            const isFolder = Boolean(payload?.folder)

            if (watchType === 'files' && !isFile) continue

            if (watchType === 'folders' && !isFolder) continue



            if (isFile && fileType && fileType !== 'any') {

              const mime: string = payload?.file?.mimeType || ''

              const matches =

                (fileType === 'images' && mime.startsWith('image/')) ||

                (fileType === 'audio' && mime.startsWith('audio/')) ||

                (fileType === 'video' && mime.startsWith('video/')) ||

                (fileType === 'pdf' && mime === 'application/pdf') ||

                (fileType === 'documents' && (mime.startsWith('text/') || mime.includes('word') || mime.includes('pdf'))) ||

                (fileType === 'spreadsheets' && mime.includes('sheet')) ||

                (fileType === 'presentations' && mime.includes('presentation')) ||

                (fileType === 'archives' && (mime.includes('zip') || mime.includes('x-tar') || mime.includes('rar')))

              if (!matches) continue

            }



            const nodeType = node?.data?.type

            if (nodeType === 'onedrive_trigger_file_created') {

              const created = payload?.createdDateTime ? new Date(payload.createdDateTime).getTime() : null

              const modified = payload?.lastModifiedDateTime ? new Date(payload.lastModifiedDateTime).getTime() : null

              if (!created || !modified) continue

              const isNew = Math.abs(modified - created) < 5000

              if (!isNew) continue

            }



            return true

          }



          return false

        }



        const matchesOutlookConfig = shouldTriggerFromOutlook(outlookNodes, event)

        console.log('dY"? Outlook trigger evaluation:', {

          matchesOutlookConfig,

          outlookNodeCount: outlookNodes.length

        })



        const shouldTrigger = otherNodes.length > 0 || matchesOutlookConfig || (await shouldTriggerFromOneDrive())

        if (!shouldTrigger) {

          console.log('?s??,? Skipping workflow execution after applying provider-specific filters')

          continue

        }

        const executionEngine = new (await import('@/lib/execution/advancedExecutionEngine')).AdvancedExecutionEngine()

        console.log('🚀 Creating execution session for workflow:', workflow.id, 'userId:', userId)

        // Create execution session properly
        const executionSession = await executionEngine.createExecutionSession(
          workflow.id,
          userId,  // Pass the correct userId
          'webhook',
          {
            inputData: {
              ...event,
              source: 'microsoft-graph-worker',
              timestamp: new Date().toISOString()
            }
          }
        )

        console.log('📤 Executing workflow with session:', executionSession.id)

        // Execute the workflow with the session
        await executionEngine.executeWorkflowAdvanced(executionSession.id, {
          ...event,
          source: 'microsoft-graph-worker',
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error(`Error processing workflow ${workflow.id} for event:`, error)
    }
  }
}



function shouldTriggerFromOutlook(nodes: any[], event: any): boolean {

  if (!Array.isArray(nodes) || nodes.length === 0) return false

  if (!event || event.type !== 'outlook_mail') return false



  const payload = event.originalPayload || {}

  const eventFrom = normalizeOutlookEmail(event.from || payload?.from?.emailAddress?.address)

  const eventSubjectSource = event.subject ?? payload?.subject

  const eventSubject = typeof eventSubjectSource === 'string' ? eventSubjectSource.trim().toLowerCase() : ''

  const eventHasAttachments = typeof event.hasAttachments === 'boolean'

    ? event.hasAttachments

    : Boolean(payload?.hasAttachments || (Array.isArray(payload?.attachments) && payload.attachments.length > 0))

  const eventImportanceSource = event.importance ?? payload?.importance

  const eventImportance = typeof eventImportanceSource === 'string' ? eventImportanceSource.trim().toLowerCase() : ''

  const eventFolderId = typeof payload?.parentFolderId === 'string' ? payload.parentFolderId.trim().toLowerCase() : ''



  for (const node of nodes) {

    const nodeType = node?.data?.type || node?.type

    if (nodeType === 'microsoft-outlook_trigger_new_email') {

      if (!(event.action === 'created' || event.action === 'draft')) continue

    } else if (nodeType === 'microsoft-outlook_trigger_email_sent') {

      if (!(event.action === 'sent' || event.action === 'created')) continue

    } else {

      continue

    }



    const config = node?.data?.config || node?.data?.triggerConfig || {}

    const fromFilters = normalizeOutlookEmailList(config.from)

    if (fromFilters.length > 0) {

      if (!eventFrom || !fromFilters.includes(eventFrom)) {

        console.log('dY"? Outlook trigger skipped (sender filter mismatch)', {

          nodeType,

          expected: fromFilters,

          actual: eventFrom

        })

        continue

      }

    }



    const subjectFilter = typeof config.subject === 'string' ? config.subject.trim().toLowerCase() : ''

    if (subjectFilter) {

      if (!eventSubject || !eventSubject.includes(subjectFilter)) {

        console.log('dY"? Outlook trigger skipped (subject filter mismatch)', {

          nodeType,

          subjectFilter,

          eventSubject

        })

        continue

      }

    }



    const attachmentConfig = config.hasAttachment ?? config.hasAttachments ?? 'any'

    const attachmentFilter = typeof attachmentConfig === 'string' ? attachmentConfig.trim().toLowerCase() : 'any'

    if (attachmentFilter === 'yes' && !eventHasAttachments) {

      console.log('dY"? Outlook trigger skipped (attachment filter requires attachments)', {

        nodeType

      })

      continue

    }

    if (attachmentFilter === 'no' && eventHasAttachments) {

      console.log('dY"? Outlook trigger skipped (attachment filter excludes attachments)', {

        nodeType

      })

      continue

    }



    const importanceFilter = typeof config.importance === 'string' ? config.importance.trim().toLowerCase() : 'any'

    if (importanceFilter && importanceFilter !== 'any') {

      if (!eventImportance || eventImportance !== importanceFilter) {

        console.log('dY"? Outlook trigger skipped (importance filter mismatch)', {

          nodeType,

          importanceFilter,

          eventImportance

        })

        continue

      }

    }



    const folderConfig = typeof config.folder === 'string' ? config.folder.trim().toLowerCase() : ''

    if (folderConfig && folderConfig !== 'inbox' && folderConfig !== 'default' && folderConfig !== 'any') {

      if (!eventFolderId || eventFolderId !== folderConfig) {

        console.log('dY"? Outlook trigger skipped (folder filter mismatch)', {

          nodeType,

          folderConfig,

          eventFolderId

        })

        continue

      }

    }



    console.log('dY"? Outlook trigger matched node configuration', {

      nodeType,

      fromFilters,

      subjectFilter,

      attachmentFilter,

      importanceFilter,

      eventFrom,

      eventSubject

    })

    return true

  }



  return false

}



function normalizeOutlookEmailList(value: any): string[] {

  if (!value) return []

  if (Array.isArray(value)) {

    return value.map(normalizeOutlookEmail).filter(Boolean)

  }

  if (typeof value === 'string') {

    const trimmed = value.trim()

    if (!trimmed) return []

    if (trimmed.startsWith('[')) {

      try {

        const parsed = JSON.parse(trimmed)

        if (Array.isArray(parsed)) {

          return parsed.map(normalizeOutlookEmail).filter(Boolean)

        }

      } catch {

        // ignore JSON parse issues

      }

    }

    return trimmed.split(',').map(normalizeOutlookEmail).filter(Boolean)

  }

  if (typeof value === 'object') {

    const candidate = value?.value ?? value?.email ?? value?.address

    if (candidate) {

      return normalizeOutlookEmailList(candidate)

    }

  }

  return []

}



function normalizeOutlookEmail(value: any): string {

  if (!value) return ''

  if (typeof value === 'string') {

    let trimmed = value.trim()

    const angleStart = trimmed.lastIndexOf('<')

    const angleEnd = trimmed.lastIndexOf('>')

    if (angleStart !== -1 && angleEnd !== -1 && angleEnd > angleStart) {

      trimmed = trimmed.slice(angleStart + 1, angleEnd)

    }

    return trimmed.trim().toLowerCase()

  }

  if (typeof value === 'object') {

    if (typeof value.address === 'string') return normalizeOutlookEmail(value.address)

    if (typeof value.email === 'string') return normalizeOutlookEmail(value.email)

    if (typeof value.value === 'string') return normalizeOutlookEmail(value.value)

  }

  return ''

}



async function fetchOneDriveChanges(payload: any, userId: string): Promise<any[]> {
  const { accessToken, refreshToken, integrationId } = await resolveOneDriveTokens(userId)

  try {
    return await fetchResourceChanges('onedrive', payload, accessToken)
  } catch (error: any) {
    const message = error?.message || ''
    if (!refreshToken || (!message.includes('InvalidAuthenticationToken') && !message.includes('expired'))) {
      throw error
    }

    // Attempt refresh
    const refreshed = await refreshOneDriveAccessToken(refreshToken)
    if (!refreshed?.accessToken) {
      throw error
    }

    await updateOneDriveTokens(integrationId, refreshed)
    return await fetchResourceChanges('onedrive', payload, refreshed.accessToken)
  }
}

async function resolveOneDriveTokens(userId: string): Promise<{ accessToken: string; refreshToken?: string; integrationId: string }> {
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, access_token, refresh_token, status')
    .eq('user_id', userId)
    .eq('provider', 'onedrive')
    .eq('status', 'connected')
    .maybeSingle()

  if (!integration) {
    throw new Error('OneDrive integration not found or not connected')
  }

  const decryptedAccess = integration.access_token ? safeDecrypt(integration.access_token) : null
  const decryptedRefresh = integration.refresh_token ? safeDecrypt(integration.refresh_token) : undefined

  if (decryptedAccess && decryptedAccess.includes('.')) {
    return {
      accessToken: decryptedAccess,
      refreshToken: decryptedRefresh,
      integrationId: integration.id
    }
  }

  if (decryptedRefresh) {
    const refreshed = await refreshOneDriveAccessToken(decryptedRefresh)
    if (refreshed?.accessToken) {
      await updateOneDriveTokens(integration.id, refreshed)
      return {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || decryptedRefresh,
        integrationId: integration.id
      }
    }
  }

  throw new Error('No valid Microsoft Graph access token available for OneDrive delta')
}

async function refreshOneDriveAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; tokenType?: string }> {
  const clientId = process.env.ONEDRIVE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth credentials not configured')
  }

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/.default'
    })
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Failed to refresh Microsoft token: ${errorText}`)
  }

  const tokenJson = await response.json()
  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresIn: tokenJson.expires_in,
    tokenType: tokenJson.token_type
  }
}

async function updateOneDriveTokens(
  integrationId: string,
  tokens: { accessToken: string; refreshToken?: string; expiresIn?: number; tokenType?: string }
): Promise<void> {
  const updateData: Record<string, any> = {
    access_token: encrypt(tokens.accessToken),
    updated_at: new Date().toISOString()
  }

  if (tokens.refreshToken) {
    updateData.refresh_token = encrypt(tokens.refreshToken)
  }

  if (typeof tokens.expiresIn === 'number') {
    updateData.expires_at = new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
  }

  // Note: token_type field doesn't exist in integrations table
  // Store it in metadata if needed
  if (tokens.tokenType) {
    const { data: existing } = await supabase
      .from('integrations')
      .select('metadata')
      .eq('id', integrationId)
      .single()

    const metadata = existing?.metadata || {}
    updateData.metadata = { ...metadata, token_type: tokens.tokenType }
  }

  const { error } = await supabase
    .from('integrations')
    .update(updateData)
    .eq('id', integrationId)

  if (error) {
    console.error('Failed to update OneDrive integration tokens:', error)
  }
}