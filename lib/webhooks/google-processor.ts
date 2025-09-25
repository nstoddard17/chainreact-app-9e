import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { queueWebhookTask } from '@/lib/webhooks/task-queue'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'

type ProcessedCalendarEventEntry = {
  processedAt: number
  lastUpdated?: number | null
}

const processedCalendarEvents = new Map<string, ProcessedCalendarEventEntry>()
const processedDriveChanges = new Map<string, ProcessedCalendarEventEntry>()
const CALENDAR_DEDUPE_WINDOW_MS = 5 * 60 * 1000

const isCalendarDebugEnabled =
  process.env.DEBUG_GOOGLE_CALENDAR === '1' || process.env.DEBUG_GOOGLE_CALENDAR === 'true'

function calendarDebug(message: string, payload?: any) {
  if (!isCalendarDebugEnabled) return
  try {
    if (payload !== undefined) {
      console.log(`[Google Calendar] ${message}`, payload)
    } else {
      console.log(`[Google Calendar] ${message}`)
    }
  } catch {
    console.log(`[Google Calendar] ${message}`)
  }
}

function calendarInfo(message: string, payload?: any) {
  try {
    if (payload !== undefined) {
      console.log(`[Google Calendar] ${message}`, payload)
    } else {
      console.log(`[Google Calendar] ${message}`)
    }
  } catch {
    console.log(`[Google Calendar] ${message}`)
  }
}

function buildCalendarDedupeKey(workflowId: string, eventId: string, changeType: string) {
  return `${workflowId}-${eventId}-${changeType}`
}

function buildDriveDedupeKey(workflowId: string, resourceId: string, changeType: string) {
  return `${workflowId}-${resourceId}-${changeType}`
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value || typeof value !== 'string') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.getTime()
}

function wasRecentlyProcessedDriveChange(
  workflowId: string,
  resourceId: string,
  changeType: string,
  updatedAt?: string | null
): boolean {
  const key = buildDriveDedupeKey(workflowId, resourceId, changeType)
  const entry = processedDriveChanges.get(key)
  if (!entry) return false

  const incomingUpdated = toTimestamp(updatedAt)

  if (incomingUpdated !== null) {
    if (entry.lastUpdated !== undefined && entry.lastUpdated !== null) {
      if (incomingUpdated <= entry.lastUpdated) {
        return true
      }
    }
    return false
  }

  if (Date.now() - entry.processedAt < CALENDAR_DEDUPE_WINDOW_MS) {
    return true
  }

  processedDriveChanges.delete(key)
  return false
}

function markDriveChangeProcessed(
  workflowId: string,
  resourceId: string,
  changeType: string,
  updatedAt?: string | null
) {
  const key = buildDriveDedupeKey(workflowId, resourceId, changeType)
  const incomingUpdated = toTimestamp(updatedAt)
  processedDriveChanges.set(key, {
    processedAt: Date.now(),
    lastUpdated: incomingUpdated
  })

  if (processedDriveChanges.size > 1000) {
    const now = Date.now()
    for (const [k, timestamp] of processedDriveChanges.entries()) {
      if (now - timestamp.processedAt > CALENDAR_DEDUPE_WINDOW_MS) {
        processedDriveChanges.delete(k)
      }
    }
  }
}

function wasRecentlyProcessedCalendarEvent(
  workflowId: string,
  eventId: string,
  changeType: string,
  updatedAt?: string | null
): boolean {
  const key = buildCalendarDedupeKey(workflowId, eventId, changeType)
  const entry = processedCalendarEvents.get(key)
  if (!entry) return false

  const incomingUpdated = toTimestamp(updatedAt)

  if (incomingUpdated !== null) {
    if (entry.lastUpdated !== undefined && entry.lastUpdated !== null) {
      if (incomingUpdated <= entry.lastUpdated) {
        return true
      }
    }
    // Newer updated timestamp – treat as fresh change
    return false
  }

  if (Date.now() - entry.processedAt < CALENDAR_DEDUPE_WINDOW_MS) {
    return true
  }

  processedCalendarEvents.delete(key)
  return false
}

function markCalendarEventProcessed(
  workflowId: string,
  eventId: string,
  changeType: string,
  updatedAt?: string | null
) {
  const key = buildCalendarDedupeKey(workflowId, eventId, changeType)
  const incomingUpdated = toTimestamp(updatedAt)
  processedCalendarEvents.set(key, {
    processedAt: Date.now(),
    lastUpdated: incomingUpdated
  })

  if (processedCalendarEvents.size > 1000) {
    const now = Date.now()
    for (const [k, timestamp] of processedCalendarEvents.entries()) {
      if (now - timestamp.processedAt > CALENDAR_DEDUPE_WINDOW_MS) {
        processedCalendarEvents.delete(k)
      }
    }
  }
}

export interface GoogleWebhookEvent {
  service: string
  eventData: any
  requestId: string
}

export async function processGoogleEvent(event: GoogleWebhookEvent): Promise<any> {
  try {
    const supabase = await createSupabaseServiceClient()

    // Store the webhook event in the database
    const { data: storedEvent, error: storeError } = await supabase
      .from('webhook_events')
      .insert({
        provider: 'google',
        service: event.service,
        event_data: event.eventData,
        request_id: event.requestId,
        status: 'received',
        timestamp: new Date().toISOString()
      })
      .select()
      .single()

    if (storeError) {
      console.error('Failed to store Google webhook event:', storeError)
    }

    // Extract token metadata if present (contains userId, integrationId, etc.)
    let metadata: any = {}
    if (event.eventData.token) {
      try {
        metadata = JSON.parse(event.eventData.token)
      } catch (e) {
        console.log('Could not parse token metadata')
      }
    }

    // Process based on service
    switch (event.service) {
      case 'drive':
        return await processGoogleDriveEvent(event, metadata)
      case 'calendar':
        return await processGoogleCalendarEvent(event, metadata)
      case 'docs':
        return await processGoogleDocsEvent(event, metadata)
      case 'sheets':
        return await processGoogleSheetsEvent(event, metadata)
      default:
        return await processGenericGoogleEvent(event)
    }
  } catch (error) {
    console.error('Error processing Google webhook event:', error)
    throw error
  }
}

async function processGoogleDriveEvent(event: GoogleWebhookEvent, metadata: any): Promise<any> {

  // Fallback: if token metadata missing, look up subscription by channelId
  if (!metadata.userId || !metadata.integrationId) {
    try {
      const channelId: string | null = (event.eventData?.channelId) 
        || (event.eventData?.headers?.['x-goog-channel-id'])
        || null
      if (channelId) {
        console.log('[Google Drive] Webhook received', {
          channelId,
          hasToken: Boolean(event.eventData?.token)
        })
        const supabaseLookup = await createSupabaseServiceClient()
        const { data: sub } = await supabaseLookup
          .from('google_watch_subscriptions')
          .select('user_id, integration_id, provider, page_token, updated_at')
          .eq('channel_id', channelId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (sub) {
          metadata = {
            ...metadata,
            userId: sub.user_id,
            integrationId: sub.integration_id
          }
          console.log('[Google Drive] Subscription metadata resolved from channel', {
            userId: metadata.userId,
            integrationId: metadata.integrationId
          })
        }
      }
    } catch {
      // ignore
    }
  }

  if (!metadata.userId || !metadata.integrationId) {
    console.log('Google Drive webhook received, but missing metadata for processing', {
      hasUserId: Boolean(metadata?.userId),
      hasIntegrationId: Boolean(metadata?.integrationId)
    })
    return { processed: true, eventType: 'drive.notification' }
  }

  const { getGoogleDriveChanges } = await import('./google-drive-watch-setup')
  const supabase = await createSupabaseServiceClient()

  // Prefer channel-scoped lookup to handle multiple rows
  let subscription: any = null
  const channelId: string | null = (event.eventData?.channelId) 
    || (event.eventData?.headers?.['x-goog-channel-id'])
    || null
  if (channelId) {
    const { data: byChannel } = await supabase
      .from('google_watch_subscriptions')
      .select('page_token, updated_at')
      .eq('channel_id', channelId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    subscription = byChannel
  }
  if (!subscription) {
    const { data: latest } = await supabase
      .from('google_watch_subscriptions')
      .select('page_token, updated_at')
      .eq('user_id', metadata.userId)
      .eq('integration_id', metadata.integrationId)
      .eq('provider', 'google-drive')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    subscription = latest
  }

  if (!subscription?.page_token) {
    console.log('Google Drive subscription missing page token, skipping change fetch', {
      userId: metadata.userId,
      integrationId: metadata.integrationId
    })
    return { processed: true, eventType: 'drive.notification' }
  }

  const pageTokenPreview = String(subscription.page_token).slice(0, 8) + '...'
  console.log('[Google Drive] Fetching changes', { pageToken: pageTokenPreview, updatedAt: subscription?.updated_at })
  const changes = await getGoogleDriveChanges(metadata.userId, metadata.integrationId, subscription.page_token)
  const watchStartTs = subscription?.updated_at ? new Date(subscription.updated_at).getTime() : null
  console.log('[Google Drive] Changes fetched', {
    count: Array.isArray(changes.changes) ? changes.changes.length : 0,
    nextPageToken: (changes.nextPageToken ? String(changes.nextPageToken).slice(0, 8) + '...' : null)
  })
  let processedChanges = 0

  for (const change of changes.changes || []) {
    processedChanges += 1

    const parentIds = Array.isArray(change.file?.parents) ? change.file.parents : []

    if (!change.file) {
      if (change.removed && change.fileId) {
        await handleDriveFileDeleted({
          fileId: change.fileId,
          file: null,
          metadata,
          parentIds
        })
      }
      continue
    }

    if (change.removed) {
      await handleDriveFileDeleted({
        fileId: change.fileId,
        file: change.file,
        metadata,
        parentIds
      })
      continue
    }

    const mimeType = change.file.mimeType || ''
    const isFolder = mimeType === 'application/vnd.google-apps.folder'

    const createdTime = change.file.createdTime ? new Date(change.file.createdTime) : null
    const nowTs = Date.now()
    // Prefer watch start time to classify true creations after watch registration
    const isNewItem = createdTime
      ? (watchStartTs !== null
          ? createdTime.getTime() >= watchStartTs
          : (nowTs - createdTime.getTime() < 120000))
      : false
    console.log('[Google Drive] Change', {
      id: change.fileId || change.file?.id,
      mimeType,
      parents: parentIds,
      createdTime: change.file.createdTime,
      isFolder,
      isNewItem
    })

    if (isFolder) {
      if (isNewItem) {
        await handleDriveFolderCreated({
          folderId: change.fileId,
          folder: change.file,
          metadata,
          parentIds
        })
      }
    } else {
      if (isNewItem) {
        await handleDriveFileCreated({
          fileId: change.fileId,
          file: change.file,
          metadata,
          parentIds
        })
      } else {
        await handleDriveFileUpdated({
          fileId: change.fileId,
          file: change.file,
          metadata,
          parentIds
        })
      }
    }

    const isGoogleDoc = mimeType === 'application/vnd.google-apps.document'
    if (isGoogleDoc) {
      await triggerDocsWorkflowsFromDriveChange(change.file, metadata, isNewItem, parentIds)
    }
  }

  const nextPageToken = changes.nextPageToken
  if (nextPageToken && nextPageToken !== subscription.page_token) {
    await supabase
      .from('google_watch_subscriptions')
      .update({
        page_token: nextPageToken,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', metadata.userId)
      .eq('integration_id', metadata.integrationId)
      .eq('provider', 'google-drive')
  }

  console.log('[Google Drive] Processed change batch', { changesCount: processedChanges })
  return { processed: true, changesCount: processedChanges }
}


async function processGoogleCalendarEvent(event: GoogleWebhookEvent, metadata: any): Promise<any> {
  const { eventData } = event

  // Google Calendar sends a notification that changes occurred
  // We need to fetch the actual changes using the Calendar API
  if (metadata.userId && metadata.integrationId && metadata.calendarId) {
    const { getGoogleCalendarChanges } = await import('./google-calendar-watch-setup')

    // Get the sync token from the subscription
    const supabase = await createSupabaseServiceClient()
    const { data: subscription } = await supabase
      .from('google_watch_subscriptions')
      .select('sync_token, metadata, updated_at')
      .eq('user_id', metadata.userId)
      .eq('integration_id', metadata.integrationId)
      .eq('provider', 'google-calendar')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fetch the actual changes
    let subscriptionMetadata: any = null
    if (subscription?.metadata) {
      if (typeof subscription.metadata === 'object') {
        subscriptionMetadata = subscription.metadata
      } else if (typeof subscription.metadata === 'string') {
        try {
          subscriptionMetadata = JSON.parse(subscription.metadata)
        } catch {
          subscriptionMetadata = null
        }
      }
    }

    const storedStartTime: string | null = subscriptionMetadata?.startTime || null
    const storedLastFetchTime: string | null = subscriptionMetadata?.lastFetchTime || null
    const isFirstSync = !subscription?.sync_token
    const effectiveWatchStartTime: string | null = isFirstSync
      ? (metadata.watchStartTime || storedStartTime || storedLastFetchTime || new Date().toISOString())
      : (metadata.watchStartTime || storedStartTime || storedLastFetchTime || null)

    calendarDebug('Metadata resolved for processing', {
      userId: metadata.userId,
      integrationId: metadata.integrationId,
      calendarId: metadata.calendarId,
      hasSyncToken: Boolean(subscription?.sync_token),
      isFirstSync,
      watchStartTime: effectiveWatchStartTime
    })

    const enrichedMetadata = {
      ...metadata,
      watchStartTime: effectiveWatchStartTime
    }

    calendarDebug('Fetching changes', {
      mode: subscription?.sync_token ? 'syncToken' : 'updatedMin',
      syncTokenPreview: subscription?.sync_token ? String(subscription.sync_token).slice(0, 12) + '...' : null,
      updatedMin: subscription?.sync_token ? null : (effectiveWatchStartTime || 'now')
    })

    const changes = await getGoogleCalendarChanges(
      metadata.userId,
      metadata.integrationId,
      metadata.calendarId,
      subscription?.sync_token,
      {
        // Only consider events after watch start on first fetch when no sync token exists
        timeMin: subscription?.sync_token ? null : (enrichedMetadata.watchStartTime || undefined)
      }
    )

    calendarDebug('Change fetch complete', {
      eventsCount: changes.events?.length || 0,
      hasNextSyncToken: Boolean(changes.nextSyncToken)
    })

    const changeStats = {
      created: 0,
      updated: 0,
      deleted: 0
    }

    // Process each event change
    for (const event of changes.events || []) {
      try {
        calendarDebug('Inspecting event change', {
          id: event.id,
          status: event.status,
          created: event.created,
          updated: event.updated
        })
      } catch {}
      if (event.status === 'cancelled') {
        changeStats.deleted += 1
        await handleCalendarEventDeleted({
          eventId: event.id,
          event,
          metadata: enrichedMetadata
        })
      } else if (event.created && event.updated) {
        // Classify strictly by equality to avoid misclassifying quick edits as "created"
        const createdTime = new Date(event.created)
        const updatedTime = new Date(event.updated)
        const isSameInstant = createdTime.getTime() === updatedTime.getTime()

        if (isSameInstant) {
          changeStats.created += 1
          await handleCalendarEventCreated({
            eventId: event.id,
            event,
            metadata: enrichedMetadata
          })
        } else {
          changeStats.updated += 1
          await handleCalendarEventUpdated({
            eventId: event.id,
            event,
            metadata: enrichedMetadata
          })
        }
      } else {
        // Fallback: if we lack timestamps but not cancelled, treat as updated to avoid missing changes
        changeStats.updated += 1
        await handleCalendarEventUpdated({
          eventId: event.id,
          event,
          metadata: enrichedMetadata
        })
      }
    }

    const processedEvents = changeStats.created + changeStats.updated + changeStats.deleted
    if (processedEvents > 0) {
      calendarInfo('Processed calendar changes', {
        calendarId: metadata.calendarId,
        processedEvents,
        changeStats
      })
    } else {
      calendarDebug('No calendar changes detected for subscription', {
        calendarId: metadata.calendarId
      })
    }

    // Update the sync token for next time (after pagination completes)
    if (changes.nextSyncToken) {
      await supabase
        .from('google_watch_subscriptions')
        .update({ sync_token: changes.nextSyncToken, updated_at: new Date().toISOString() })
        .eq('user_id', metadata.userId)
        .eq('integration_id', metadata.integrationId)
        .eq('provider', 'google-calendar')
      calendarDebug('Persisted nextSyncToken for subscription', {
        calendarId: metadata.calendarId
      })
    } else {
      // Persist lastFetchTime fallback so subsequent runs can use updatedMin reliably
      const newMetadata = {
        ...(subscriptionMetadata || {}),
        lastFetchTime: new Date().toISOString()
      }
      await supabase
        .from('google_watch_subscriptions')
        .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
        .eq('user_id', metadata.userId)
        .eq('integration_id', metadata.integrationId)
        .eq('provider', 'google-calendar')
      calendarDebug('Persisted lastFetchTime metadata for subscription', {
        calendarId: metadata.calendarId
      })
    }

    return { processed: true, eventsCount: changes.events?.length || 0 }
  }

  // Fallback to generic processing
  calendarDebug('Google Calendar webhook received, but missing metadata for processing', {
    hasUserId: Boolean(metadata?.userId),
    hasIntegrationId: Boolean(metadata?.integrationId),
    hasCalendarId: Boolean(metadata?.calendarId)
  })
  return { processed: true, eventType: 'calendar.notification' }
}

type CalendarChangeType = 'created' | 'updated' | 'deleted'
type DriveChangeType = 'file_created' | 'file_updated' | 'folder_created'

async function triggerMatchingCalendarWorkflows(changeType: CalendarChangeType, calendarEvent: any, metadata: any, options?: { watchStartTime?: string | null }) {
  if (!calendarEvent) {
    calendarDebug('Event payload missing event details, skipping', {
      changeType
    })
    return
  }

  const userId = metadata?.userId
  if (!userId) {
    calendarDebug('Missing userId in metadata, skipping workflow trigger', {
      changeType
    })
    return
  }

  let watchStartTime: Date | null = null
  const metadataStart = metadata?.watchStartTime || options?.watchStartTime
  if (typeof metadataStart === 'string' && metadataStart.trim().length > 0) {
    const parsed = new Date(metadataStart)
    if (!Number.isNaN(parsed.getTime())) {
      watchStartTime = parsed
    }
  }

  const triggerTypeMap: Record<CalendarChangeType, string> = {
    created: 'google_calendar_trigger_new_event',
    updated: 'google_calendar_trigger_event_updated',
    deleted: 'google_calendar_trigger_event_canceled'
  }

  const triggerType = triggerTypeMap[changeType]
  const eventId: string | undefined = calendarEvent.id || calendarEvent.eventId || calendarEvent.event_id
  const calendarId = metadata?.calendarId || 'primary'

  try {
    const supabase = await createSupabaseServiceClient()

    let query = supabase
      .from('webhook_configs')
      .select('id, workflow_id, config, status, provider_id, trigger_type')
      .eq('trigger_type', triggerType)
      .eq('status', 'active')
      .eq('provider_id', 'google-calendar')

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: webhookConfigs, error: webhookError } = await query

    if (webhookError) {
      console.error('[Google Calendar] Failed to fetch webhook configs:', webhookError)
      return
    }

    if (!webhookConfigs || webhookConfigs.length === 0) {
      return
    }

    const workflowIds = webhookConfigs
      .map((config) => config.workflow_id)
      .filter((id): id is string => Boolean(id))

    if (workflowIds.length === 0) {
      calendarDebug('No workflow IDs associated with webhook configs, skipping', {
        changeType
      })
      return
    }

    const { data: workflows, error: workflowsError } = await supabase
      .from('workflows')
      .select('id, user_id, nodes, connections, name, status')
      .in('id', workflowIds)
      .eq('status', 'active')

    if (workflowsError) {
      console.error('[Google Calendar] Failed to fetch workflows:', workflowsError)
      return
    }

    if (!workflows || workflows.length === 0) {
      return
    }

    for (const webhookConfig of webhookConfigs) {
      if (!webhookConfig.workflow_id) continue

      const workflow = workflows.find((w) => w.id === webhookConfig.workflow_id)
      if (!workflow) {
        calendarDebug('Workflow not found for webhook config, skipping', {
          workflowId: webhookConfig.workflow_id
        })
        continue
      }

      const configData = (webhookConfig.config || {}) as any
      const watchConfig = configData.watch || {}

      const configuredCalendars: string[] | null = Array.isArray(configData.calendars) ? configData.calendars : null
      const configuredCalendarId =
        watchConfig.calendarId ||
        configData.calendarId ||
        (configuredCalendars ? configuredCalendars[0] : undefined) ||
        'primary'

      const watchStartTime = watchConfig.startTime ? new Date(watchConfig.startTime) : null

      if (calendarId) {
        if (configuredCalendars && configuredCalendars.length > 0) {
          if (!configuredCalendars.includes(calendarId)) {
            continue
          }
        } else if (configuredCalendarId && configuredCalendarId !== calendarId) {
          continue
        }
      }

      const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []

      const matchingTriggers = nodes.filter((node: any) => {
        const nodeType = node?.data?.type || node?.type || node?.data?.nodeType
        if (nodeType !== triggerType) return false
        if (!node?.data?.isTrigger) return false

        const nodeCalendars: string[] | null = Array.isArray(node?.data?.config?.calendars) ? node.data.config.calendars : null
        const nodeCalendarId = node?.data?.config?.calendarId || node?.data?.config?.calendar?.id || null

        if (nodeCalendars && nodeCalendars.length > 0) {
          if (calendarId && !nodeCalendars.includes(calendarId)) return false
        } else if (nodeCalendarId) {
          if (calendarId && nodeCalendarId !== calendarId) return false
        } else {
          // No calendar configured on node; default to allow when workflow-level config matched
        }

        return true
      })

      if (matchingTriggers.length === 0) {
        calendarDebug('No matching calendar triggers for workflow', {
          workflowId: workflow.id,
          triggerType,
          calendarId
        })
        continue
      }

      calendarInfo('Calendar trigger matched workflow', {
        workflowId: workflow.id,
        changeType,
        triggerType,
        calendarId,
        eventId,
        triggerCount: matchingTriggers.length
      })

      if (watchStartTime) {
        const eventTimestamp = resolveCalendarEventTimestamp(calendarEvent)
        if (eventTimestamp && eventTimestamp.getTime() < watchStartTime.getTime()) {
          calendarDebug('Skipping event older than watch start', {
            workflowId: workflow.id,
            changeType,
            eventTimestamp: eventTimestamp.toISOString(),
            watchStartTime: watchStartTime.toISOString()
          })
          continue
        }
      }

      const calendarUpdatedAt = typeof calendarEvent?.updated === 'string' ? calendarEvent.updated : null
      const dedupeHit = eventId && wasRecentlyProcessedCalendarEvent(workflow.id, eventId, changeType, calendarUpdatedAt)
      if (dedupeHit) {
        calendarDebug('Skipping duplicate calendar event within dedupe window', {
          workflowId: workflow.id,
          changeType,
          eventId
        })
        continue
      }

      const triggerPayload = {
        provider: 'google-calendar',
        changeType,
        calendarId,
        eventId,
        event: calendarEvent,
        metadata
      }

      try {
        // Mark as processed BEFORE starting execution to avoid concurrent duplicates
        if (eventId) {
          markCalendarEventProcessed(workflow.id, eventId, changeType, calendarUpdatedAt)
        }

        const executionEngine = new AdvancedExecutionEngine()
        const nodeCount = Array.isArray(workflow.nodes) ? workflow.nodes.length : 0
        const connectionCount = Array.isArray((workflow as any).connections) ? workflow.connections.length : 0
        calendarInfo('Dispatching workflow execution', {
          workflowId: workflow.id,
          changeType,
          nodeCount,
          connectionCount
        })
        calendarDebug('Execution input payload snapshot', {
          workflowId: workflow.id,
          eventId,
          payloadKeys: Object.keys(triggerPayload || {})
        })
        const executionSession = await executionEngine.createExecutionSession(
          workflow.id,
          workflow.user_id,
          'webhook',
          {
            inputData: triggerPayload,
            webhookEvent: {
              provider: 'google-calendar',
              changeType,
              metadata,
              event: calendarEvent
            }
          }
        )

        await executionEngine.executeWorkflowAdvanced(executionSession.id, triggerPayload)
        calendarInfo('Workflow execution started', {
          workflowId: workflow.id,
          executionSessionId: executionSession.id
        })

      } catch (workflowError) {
        console.error(`[Google Calendar] Failed to execute workflow ${workflow.id}:`, workflowError)
        calendarDebug('Workflow execution error details', {
          workflowId: workflow.id,
          message: workflowError instanceof Error ? workflowError.message : String(workflowError)
        })
        if (eventId) {
          processedCalendarEvents.delete(buildCalendarDedupeKey(workflow.id, eventId, changeType))
        }
      }
    }
  } catch (error) {
    console.error('[Google Calendar] Error triggering workflows for calendar event:', error)
  }
}

async function triggerMatchingDriveWorkflows(changeType: DriveChangeType, driveItem: any, metadata: any, options?: { parentIds?: string[]; isFolder?: boolean }) {
  if (!driveItem) {
    console.debug('[Google Drive] Change payload missing drive item details, skipping')
    return
  }

  const userId = metadata?.userId
  if (!userId) {
    console.debug('[Google Drive] Missing userId in metadata, skipping workflow trigger')
    return
  }

  const parentIds = Array.isArray(options?.parentIds) ? options!.parentIds! : (Array.isArray(driveItem.parents) ? driveItem.parents : [])
  const parentId = parentIds.length > 0 ? parentIds[0] : null
  const drivePayload = { ...driveItem, parents: parentIds }
  const resourceId: string | undefined = drivePayload.id || drivePayload.fileId
  if (!resourceId) {
    console.debug('[Google Drive] Missing resource id for change, skipping')
    return
  }

  const triggerTypeMap: Record<DriveChangeType, string> = {
    file_created: 'google-drive:new_file_in_folder',
    folder_created: 'google-drive:new_folder_in_folder',
    file_updated: 'google-drive:file_updated'
  }

  const triggerType = triggerTypeMap[changeType]

  try {
    const supabase = await createSupabaseServiceClient()

    const { data: webhookConfigs, error: webhookError } = await supabase
      .from('webhook_configs')
      .select('id, workflow_id, config, status, provider_id, trigger_type')
      .eq('trigger_type', triggerType)
      .eq('status', 'active')
      .eq('provider_id', 'google-drive')
      .eq('user_id', userId)

    if (webhookError) {
      console.error('[Google Drive] Failed to fetch webhook configs:', webhookError)
      return
    }

    if (!webhookConfigs || webhookConfigs.length === 0) {
      return
    }

    const workflowIds = webhookConfigs
      .map((config) => config.workflow_id)
      .filter((id): id is string => Boolean(id))

    if (workflowIds.length === 0) {
      return
    }

    const { data: workflows, error: workflowsError } = await supabase
      .from('workflows')
      .select('id, user_id, nodes, connections, name, status')
      .in('id', workflowIds)
      .eq('status', 'active')

    if (workflowsError) {
      console.error('[Google Drive] Failed to fetch workflows:', workflowsError)
      return
    }

    if (!workflows || workflows.length === 0) {
      return
    }

    for (const webhookConfig of webhookConfigs) {
      if (!webhookConfig.workflow_id) continue

      const workflow = workflows.find((w) => w.id === webhookConfig.workflow_id)
      if (!workflow) {
        continue
      }

      const configData = (webhookConfig.config || {}) as any
      const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []

      const matchingTriggers = nodes.filter((node: any) => {
        const nodeType = node?.data?.type || node?.type || node?.data?.nodeType
        if (nodeType !== triggerType) return false
        if (!node?.data?.isTrigger) return false

        const nodeConfig = node?.data?.config || {}

        switch (changeType) {
          case 'file_created': {
            const folderId = configData?.folderId || nodeConfig?.folderId || null
            if (folderId) {
              return parentIds.includes(folderId)
            }
            return true
          }
          case 'folder_created': {
            const folderId = configData?.folderId || configData?.parentFolderId || nodeConfig?.folderId || nodeConfig?.parentFolderId || null
            if (folderId) {
              return parentIds.includes(folderId)
            }
            return true
          }
          case 'file_updated': {
            const configuredFileId = configData?.fileId || nodeConfig?.fileId || configData?.folderId || nodeConfig?.folderId || null
            if (configuredFileId) {
              return configuredFileId === resourceId
            }
            return true
          }
          default:
            return false
        }
      })

      if (matchingTriggers.length === 0) {
        continue
      }

      const lastUpdated = drivePayload.modifiedTime || drivePayload.createdTime || null
      if (wasRecentlyProcessedDriveChange(workflow.id, resourceId, changeType, lastUpdated)) {
        continue
      }

      const triggerPayload: any = {
        provider: 'google-drive',
        changeType,
        resourceId,
        parentId,
        parentIds,
        item: drivePayload,
        file: options?.isFolder ? undefined : drivePayload,
        folder: options?.isFolder ? drivePayload : undefined,
        metadata
      }

      try {
        markDriveChangeProcessed(workflow.id, resourceId, changeType, lastUpdated)

        const executionEngine = new AdvancedExecutionEngine()
        const executionSession = await executionEngine.createExecutionSession(
          workflow.id,
          workflow.user_id,
          'webhook',
          {
            inputData: triggerPayload,
            webhookEvent: {
              provider: 'google-drive',
              changeType,
              metadata,
              event: drivePayload
            }
          }
        )

        await executionEngine.executeWorkflowAdvanced(executionSession.id, triggerPayload)
        console.log('[Google Drive] Workflow execution started', {
          workflowId: workflow.id,
          executionSessionId: executionSession.id,
          changeType
        })

      } catch (workflowError) {
        console.error(`[Google Drive] Failed to execute workflow ${workflow.id}:`, workflowError)
        processedDriveChanges.delete(buildDriveDedupeKey(workflow.id, resourceId, changeType))
      }
    }
  } catch (error) {
    console.error('[Google Drive] Error triggering workflows for drive change:', error)
  }
}

async function triggerDocsWorkflowsFromDriveChange(driveFile: any, metadata: any, isNewItem: boolean, parentIds: string[]) {
  if (!driveFile || !driveFile.id) return

  const docEventPayload = {
    id: driveFile.id,
    title: driveFile.name,
    properties: {},
    parent: parentIds[0],
    created_time: driveFile.createdTime,
    last_edited_time: driveFile.modifiedTime,
    url: driveFile.webViewLink
  }

  try {
    const supabase = await createSupabaseServiceClient()
    const { data: docWorkflows, error } = await supabase
      .from('workflows')
      .select('id, user_id, nodes, status')
      .eq('status', 'active')
      .eq('user_id', metadata?.userId)

    if (error) {
      console.error('[Google Drive] Failed to fetch Google Docs workflows:', error)
    } else {
      for (const wf of docWorkflows || []) {
        const nodes = Array.isArray(wf.nodes) ? wf.nodes : []
        const matchingNewDocTriggers = nodes.filter((n: any) => n?.data?.isTrigger && n?.data?.type === 'google_docs_trigger_new_document')
        for (const trig of matchingNewDocTriggers) {
          const cfg = trig?.data?.config || {}
          if (cfg.folderId && parentIds.length > 0 && !parentIds.includes(cfg.folderId)) {
            continue
          }
          if (cfg.mimeType && driveFile.mimeType && cfg.mimeType !== driveFile.mimeType) {
            continue
          }

          const engine = new AdvancedExecutionEngine()
          const session = await engine.createExecutionSession(
            wf.id,
            wf.user_id,
            'webhook',
            {
              inputData: {
                provider: 'google-docs',
                changeType: isNewItem ? 'document_created' : 'document_updated',
                document: docEventPayload,
                metadata
              },
              webhookEvent: {
                provider: 'google-docs',
                changeType: isNewItem ? 'document_created' : 'document_updated',
                metadata,
                event: docEventPayload
              }
            }
          )

          await engine.executeWorkflowAdvanced(session.id, {
            provider: 'google-docs',
            changeType: isNewItem ? 'document_created' : 'document_updated',
            document: docEventPayload,
            metadata
          })
        }
      }
    }
  } catch (docError) {
    console.error('Failed to trigger Google Docs workflow from Drive change:', docError)
  }

  if (isNewItem) {
    await handleDocsDocumentCreated({ document_id: driveFile.id, ...docEventPayload })
  } else {
    await handleDocsDocumentUpdated({ document_id: driveFile.id, ...docEventPayload })
  }
}

function resolveCalendarEventTimestamp(calendarEvent: any): Date | null {
  const candidates = [
    calendarEvent?.updated,
    calendarEvent?.created,
    calendarEvent?.start?.dateTime,
    calendarEvent?.start?.date
  ]

  for (const value of candidates) {
    if (typeof value !== 'string' || value.trim().length === 0) continue

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T00:00:00Z`)
    }

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return null
}

async function processGoogleDocsEvent(event: GoogleWebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different Google Docs event types
  switch (eventData.type) {
    case 'document.created':
      return await handleDocsDocumentCreated(eventData)
    case 'document.updated':
      return await handleDocsDocumentUpdated(eventData)
    case 'document.deleted':
      return await handleDocsDocumentDeleted(eventData)
    case 'comment.added':
      return await handleDocsCommentAdded(eventData)
    default:
      console.log('Unhandled Google Docs event type:', eventData.type)
      return { processed: true, eventType: eventData.type }
  }
}

async function processGoogleSheetsEvent(event: GoogleWebhookEvent, metadata: any): Promise<any> {
  const { eventData } = event

  // Google Sheets uses Drive API for webhooks
  // We need to check what changed in the spreadsheet
  if (metadata.userId && metadata.integrationId && metadata.spreadsheetId) {
    const { checkGoogleSheetsChanges } = await import('./google-sheets-watch-setup')

    // Get the previous metadata from the subscription
    const supabase = await createSupabaseServiceClient()
    const { data: subscription } = await supabase
      .from('google_watch_subscriptions')
      .select('metadata')
      .eq('user_id', metadata.userId)
      .eq('integration_id', metadata.integrationId)
      .eq('provider', 'google-sheets')
      .single()

    if (subscription?.metadata) {
      // Check for changes
      const result = await checkGoogleSheetsChanges(
        metadata.userId,
        metadata.integrationId,
        metadata.spreadsheetId,
        subscription.metadata
      )

      // Process each change
      for (const change of result.changes || []) {
        switch (change.type) {
          case 'new_row':
            await handleSheetsRowCreated({
              spreadsheetId: metadata.spreadsheetId,
              sheetName: change.sheetName,
              rowNumber: change.rowNumber,
              data: change.data,
              metadata
            })
            break
          case 'updated_row':
            await handleSheetsRowUpdated({
              spreadsheetId: metadata.spreadsheetId,
              sheetName: change.sheetName,
              message: change.message,
              metadata
            })
            break
          case 'new_worksheet':
            await handleSheetsSheetCreated({
              spreadsheetId: metadata.spreadsheetId,
              sheetName: change.sheetName,
              sheetId: change.sheetId,
              metadata
            })
            break
        }
      }

      // Update the metadata for next comparison
      if (result.updatedMetadata) {
        await supabase
          .from('google_watch_subscriptions')
          .update({ metadata: result.updatedMetadata })
          .eq('user_id', metadata.userId)
          .eq('integration_id', metadata.integrationId)
          .eq('provider', 'google-sheets')
      }

      return { processed: true, changesCount: result.changes?.length || 0 }
    }
  }

  // Fallback to generic processing
  console.log('Google Sheets webhook received, but missing metadata for processing')
  return { processed: true, eventType: 'sheets.notification' }
}

async function processGenericGoogleEvent(event: GoogleWebhookEvent): Promise<any> {
  // Generic Google event processing
  console.log('Processing generic Google webhook event:', event.service)
  
  // Queue for background processing if needed
  await queueWebhookTask({
    provider: 'google',
    service: event.service,
    eventData: event.eventData,
    requestId: event.requestId
  })
  
  return { processed: true, service: event.service }
}

// Google Drive event handlers
async function handleDriveFileCreated(eventData: any): Promise<any> {
  const parentIds: string[] = Array.isArray(eventData.parentIds) ? eventData.parentIds : []
  const driveItem = {
    ...(eventData.file || {}),
    id: eventData.file?.id || eventData.fileId,
    parents: parentIds
  }
  await triggerMatchingDriveWorkflows('file_created', driveItem, eventData.metadata || {}, {
    parentIds,
    isFolder: false
  })
  return { processed: true, type: 'drive_file_created', fileId: eventData.fileId || eventData.file?.id }
}

async function handleDriveFileUpdated(eventData: any): Promise<any> {
  const parentIds: string[] = Array.isArray(eventData.parentIds) ? eventData.parentIds : []
  const driveItem = {
    ...(eventData.file || {}),
    id: eventData.file?.id || eventData.fileId,
    parents: parentIds
  }
  await triggerMatchingDriveWorkflows('file_updated', driveItem, eventData.metadata || {}, {
    parentIds,
    isFolder: false
  })
  return { processed: true, type: 'drive_file_updated', fileId: eventData.fileId || eventData.file?.id }
}

async function handleDriveFileDeleted(eventData: any): Promise<any> {
  const targetId = eventData.fileId || eventData.file?.id
  console.log('Processing Google Drive file deleted:', targetId)
  return { processed: true, type: 'drive_file_deleted', fileId: targetId }
}

async function handleDriveFolderCreated(eventData: any): Promise<any> {
  const parentIds: string[] = Array.isArray(eventData.parentIds) ? eventData.parentIds : []
  const driveItem = {
    ...(eventData.folder || {}),
    id: eventData.folder?.id || eventData.folderId,
    parents: parentIds
  }
  await triggerMatchingDriveWorkflows('folder_created', driveItem, eventData.metadata || {}, {
    parentIds,
    isFolder: true
  })
  return { processed: true, type: 'drive_folder_created', folderId: eventData.folderId || eventData.folder?.id }
}

// Google Calendar event handlers
async function handleCalendarEventCreated(eventData: any): Promise<any> {
  const eventId: string | undefined = eventData.eventId || eventData.event_id || eventData.event?.id
  await triggerMatchingCalendarWorkflows('created', eventData.event, eventData.metadata, {
    watchStartTime: eventData.metadata?.watchStartTime || null
  })
  return { processed: true, type: 'calendar_event_created', eventId }
}

async function handleCalendarEventUpdated(eventData: any): Promise<any> {
  const eventId: string | undefined = eventData.eventId || eventData.event_id || eventData.event?.id
  await triggerMatchingCalendarWorkflows('updated', eventData.event, eventData.metadata, {
    watchStartTime: eventData.metadata?.watchStartTime || null
  })
  return { processed: true, type: 'calendar_event_updated', eventId }
}

async function handleCalendarEventDeleted(eventData: any): Promise<any> {
  const eventId: string | undefined = eventData.eventId || eventData.event_id || eventData.event?.id
  await triggerMatchingCalendarWorkflows('deleted', eventData.event, eventData.metadata, {
    watchStartTime: eventData.metadata?.watchStartTime || null
  })
  return { processed: true, type: 'calendar_event_deleted', eventId }
}

async function handleCalendarCreated(eventData: any): Promise<any> {
  console.log('Processing Google Calendar created:', eventData.calendar_id)
  return { processed: true, type: 'calendar_created', calendarId: eventData.calendar_id }
}

// Google Docs event handlers
async function handleDocsDocumentCreated(eventData: any): Promise<any> {
  console.log('Processing Google Docs document created:', eventData.document_id)
  return { processed: true, type: 'docs_document_created', documentId: eventData.document_id }
}

async function handleDocsDocumentUpdated(eventData: any): Promise<any> {
  console.log('Processing Google Docs document updated:', eventData.document_id)
  return { processed: true, type: 'docs_document_updated', documentId: eventData.document_id }
}

async function handleDocsDocumentDeleted(eventData: any): Promise<any> {
  console.log('Processing Google Docs document deleted:', eventData.document_id)
  return { processed: true, type: 'docs_document_deleted', documentId: eventData.document_id }
}

async function handleDocsCommentAdded(eventData: any): Promise<any> {
  console.log('Processing Google Docs comment added:', eventData.comment_id)
  return { processed: true, type: 'docs_comment_added', commentId: eventData.comment_id }
}

// Google Sheets event handlers
async function handleSheetsSpreadsheetCreated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets spreadsheet created:', eventData.spreadsheet_id)
  return { processed: true, type: 'sheets_spreadsheet_created', spreadsheetId: eventData.spreadsheet_id }
}

async function handleSheetsSpreadsheetUpdated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets spreadsheet updated:', eventData.spreadsheet_id)
  return { processed: true, type: 'sheets_spreadsheet_updated', spreadsheetId: eventData.spreadsheet_id }
}

async function handleSheetsCellUpdated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets cell updated:', eventData.cell_range)
  return { processed: true, type: 'sheets_cell_updated', cellRange: eventData.cell_range }
}

async function handleSheetsSheetCreated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets sheet created:', eventData.sheetName || eventData.sheet_id)

  // Trigger workflow if there's a workflow configured for new worksheet trigger
  if (eventData.metadata?.userId) {
    // Here you would trigger the workflow execution
    // This would integrate with your workflow execution system
    console.log('Would trigger workflow for new worksheet:', eventData.sheetName)
  }

  return { processed: true, type: 'sheets_sheet_created', sheetId: eventData.sheetId || eventData.sheet_id }
}

async function handleSheetsRowCreated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets new row:', eventData.sheetName, eventData.rowNumber)

  // Trigger workflow if there's a workflow configured for new row trigger
  if (eventData.metadata?.userId) {
    // Here you would trigger the workflow execution
    // This would integrate with your workflow execution system
    console.log('Would trigger workflow for new row:', eventData.data)
  }

  return { processed: true, type: 'sheets_row_created', rowData: eventData.data }
}

async function handleSheetsRowUpdated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets row updated:', eventData.sheetName)

  // Trigger workflow if there's a workflow configured for updated row trigger
  if (eventData.metadata?.userId) {
    // Here you would trigger the workflow execution
    // This would integrate with your workflow execution system
    console.log('Would trigger workflow for updated row')
  }

  return { processed: true, type: 'sheets_row_updated', message: eventData.message }
} 
