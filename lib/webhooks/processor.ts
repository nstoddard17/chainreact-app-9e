import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'
import { logWebhookEvent } from './event-logger'

import { logger } from '@/lib/utils/logger'

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
 * Get Slack team ID from integration
 * Used for workspace filtering - ensures events only trigger workflows for the correct workspace
 */
async function getSlackTeamIdFromIntegration(integrationId: string): Promise<string | null> {
  const supabase = await createSupabaseServiceClient()

  const { data: integration } = await supabase
    .from('integrations')
    .select('team_id, metadata')
    .eq('id', integrationId)
    .eq('provider', 'slack')
    .single()

  if (!integration) return null

  // Try top-level first, then metadata for backwards compatibility
  return integration.team_id || (integration.metadata as any)?.team_id || null
}

/**
 * Enhanced webhook event processor with instant execution
 */

export async function processWebhookEvent(event: WebhookEvent): Promise<any> {
  const startTime = Date.now()

  try {
    const dedupeKey = event.id || event.eventData?.id || event.eventData?.message?.id
    let supabaseForDedupe: Awaited<ReturnType<typeof createSupabaseServiceClient>> | null = null

    if (dedupeKey) {
      try {
        supabaseForDedupe = await createSupabaseServiceClient()
        const { data: existingEvent, error: dedupeError } = await supabaseForDedupe
          .from('webhook_events')
          .select('id')
          .eq('provider', event.provider)
          .eq('request_id', dedupeKey)
          .maybeSingle()

        if (!dedupeError && existingEvent) {
          logger.info(`🧊 Duplicate webhook event ignored`, {
            provider: event.provider,
            dedupeKey
          })
          return {
            success: true,
            workflowsTriggered: 0,
            duplicate: true,
            processingTime: Date.now() - startTime
          }
        }
      } catch (dedupeCheckError) {
        logger.warn('⚠️ Failed to perform webhook dedupe check:', dedupeCheckError)
      }
    }

    // 1. Store event for audit trail (non-blocking)
    await storeWebhookEvent(event, dedupeKey, supabaseForDedupe)

    // 2. Find matching workflows instantly
    const matchingWorkflows = await findMatchingWorkflows(event)

    // INFO-level logging to trace workflow matching
    logger.info(`🔵 WEBHOOK PROCESSOR: Found ${matchingWorkflows.length} matching workflows for eventType=${event.eventType}, provider=${event.provider}`)

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

  // Find all active workflows first
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('id, name, user_id, status')
    // Include drafts so users can test workflows before publishing
    .in('status', ['active', 'draft'])

  if (error) {
    logger.error('Error finding matching workflows:', error)
    return []
  }

  logger.info(`🔍 Found ${workflows?.length || 0} active/draft workflows to check`)

  if (!workflows || workflows.length === 0) return []

  // Load nodes for all workflows in parallel
  const workflowsWithNodes = await Promise.all(
    workflows.map(async (workflow) => {
      const { data: dbNodes } = await supabase
        .from('workflow_nodes')
        .select('*')
        .eq('workflow_id', workflow.id)
        .order('display_order')

      const nodes = (dbNodes || []).map((n: any) => ({
        id: n.id,
        type: n.node_type,
        position: { x: n.position_x, y: n.position_y },
        data: {
          type: n.node_type,
          label: n.label,
          config: n.config || {},
          isTrigger: n.is_trigger,
          providerId: n.provider_id,
          triggerConfig: n.config?.triggerConfig
        }
      }))

      return { ...workflow, nodes }
    })
  )

  // First pass: Filter workflows by trigger type (sync filtering)
  const potentialWorkflows: Array<{ workflow: any; triggerNode: any }> = []

  for (const workflow of workflowsWithNodes) {
    logger.info(`🔍 Checking workflow: "${workflow.name}" (${workflow.id})`)

    if (!workflow.nodes || workflow.nodes.length === 0) {
      logger.info(`   ❌ No nodes found for workflow ${workflow.id}`)
      continue
    }

    // Log trigger nodes for debugging
    const triggerNodes = workflow.nodes.filter((n: any) => n.data?.isTrigger || n.isTrigger)
    logger.info(`   📋 Found ${triggerNodes.length} trigger nodes:`, triggerNodes.map((n: any) => ({
      type: n.data?.type || n.type,
      provider: n.data?.providerId,
      isTrigger: n.data?.isTrigger
    })))

    const triggerNode = workflow.nodes?.find((node: any) => {
      const nodeData = node?.data || {}
      const nodeType = nodeData.type || node.type
      const nodeProvider = nodeData.providerId || nodeData.triggerConfig?.provider || node.providerId
      const nodeEventType = nodeData.triggerConfig?.eventType || nodeType
      const isTrigger = Boolean(nodeData.isTrigger || node.isTrigger)

      // Enhanced debugging to see exact node structure
      logger.info(`   🔍 Checking node: ${node.type} (ReactFlow type)`)
      logger.info(`      Full node.data keys:`, Object.keys(nodeData))
      logger.info(`      data.type: ${nodeData.type}`)
      logger.info(`      data.isTrigger: ${nodeData.isTrigger}`)
      logger.info(`      data.providerId: ${nodeData.providerId}`)
      logger.info(`      eventType (computed): ${nodeEventType}`)

      // If this is a trigger node but missing type, log full data
      if (isTrigger && !nodeData.type) {
        logger.warn(`[WebhookProcessor] Trigger node missing data.type`, { nodeKeys: Object.keys(nodeData), isTrigger: nodeData.isTrigger, providerId: nodeData.providerId })
      }

      if (!isTrigger) {
        return false
      }

      if (nodeProvider && nodeProvider !== event.provider) {
        return false
      }

      let matchesEventType = true
      if (nodeEventType) {
        // Map Notion event types to trigger types
        // Supports both legacy event names and new data source API (2025-09-03) event names
        if (event.provider === 'notion') {
          const notionEventMap: Record<string, string[]> = {
            // Core triggers
            'notion_trigger_new_comment': ['comment.created'],

            // Database item triggers - includes new data_source.row events
            'notion_trigger_database_item_created': [
              'page.created',
              'data_source.row_created'  // New API event
            ],
            'notion_trigger_database_item_updated': [
              'page.updated',
              'page.content_updated',
              'page.property_values_updated',
              'page.properties_updated',
              'data_source.row_updated'  // New API event
            ],

            // Granular page triggers - includes new data_source events
            'notion_trigger_page_content_updated': [
              'page.content_updated',
              'block.created',
              'block.updated',
              'block.deleted',
              'data_source.row_content_updated'  // New API event (if exists)
            ],
            'notion_trigger_page_properties_updated': [
              'page.property_values_updated',
              'page.properties_updated',
              'data_source.row_updated',  // New API - property value changes
              'data_source.row_property_updated',  // New API - specific property change
              'data_source.schema_updated'  // When properties are added/removed/modified
            ],

            // Database schema trigger
            'notion_trigger_database_schema_updated': [
              'database.updated',
              'data_source.schema_updated'
            ]
          }
          const allowedEvents = notionEventMap[nodeEventType] || []
          matchesEventType = allowedEvents.includes(event.eventType)
          logger.info(`   🔎 Notion trigger check: nodeEventType=${nodeEventType}, allowedEvents=${JSON.stringify(allowedEvents)}, webhookEvent=${event.eventType}, matches=${matchesEventType}`)
        } else {
          matchesEventType = nodeEventType === event.eventType ||
            (nodeEventType === 'slack_trigger_new_message' && event.eventType?.startsWith('slack_trigger_message'))
        }
      }

      if (!matchesEventType) {
        logger.info(`      ❌ Event type mismatch: node=${nodeEventType}, event=${event.eventType}`)
        return false
      }

      if (!nodeData.triggerConfig && nodeData.config) {
        nodeData.triggerConfig = nodeData.config
      }

      return true
    })

    if (!triggerNode) {
      logger.info(`   ❌ No matching trigger found for workflow ${workflow.id}`)
      continue
    }

    logger.info(`   ✅ Found matching trigger for workflow ${workflow.id}!`)
    potentialWorkflows.push({ workflow, triggerNode })
  }

  // Second pass: Apply async filters (e.g., Slack workspace filtering)
  const matchingWorkflows: any[] = []
  for (const { workflow, triggerNode } of potentialWorkflows) {
    const passesFilters = await applyTriggerFilters(triggerNode, event)
    if (passesFilters) {
      matchingWorkflows.push(workflow)
    }
  }

  logger.info(`🎯 Found ${matchingWorkflows.length} matching workflows`)
  return matchingWorkflows
}

/**
 * Apply custom trigger filters (e.g., sender, subject, workspace, etc.)
 * Made async to support Slack workspace lookup
 */
async function applyTriggerFilters(triggerNode: any, event: WebhookEvent): Promise<boolean> {
  const config = triggerNode.data?.triggerConfig || triggerNode.data?.config || {}

  // Slack specific filters - filter by workspace (team)
  if (event.provider === 'slack') {
    const workspaceIntegrationId = config.workspace || config.integrationId
    const eventTeamId = event.eventData?.team || event.eventData?.message?.team

    if (workspaceIntegrationId && eventTeamId) {
      // Look up the integration's team_id and compare
      const expectedTeamId = await getSlackTeamIdFromIntegration(workspaceIntegrationId)
      if (expectedTeamId && expectedTeamId !== eventTeamId) {
        logger.info(`   ❌ Slack workspace mismatch: event team=${eventTeamId}, expected=${expectedTeamId}`)
        return false
      }
      logger.info(`   ✅ Slack workspace match: ${eventTeamId}`)
    }
  }

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

  // Trello specific filters
  if (event.provider === 'trello') {
    const boardFilter = config.boardId || config.board_id
    if (boardFilter) {
      const eventBoardId = event.eventData?.boardId || event.eventData?.board_id
      if (eventBoardId && eventBoardId !== boardFilter) {
        return false
      }
    }

    const listFilter = config.listId || config.list_id
    if (listFilter) {
      const listCandidates = [
        event.eventData?.listId,
        event.eventData?._listId,
        event.eventData?.fromListId,
        event.eventData?.toListId,
        event.eventData?._listAfterId,
        event.eventData?._listBeforeId,
      ]
        .map(value => (value ? String(value) : null))
        .filter((value): value is string => Boolean(value))

      if (listCandidates.length > 0 && !listCandidates.includes(String(listFilter))) {
        return false
      }
    }

    // watchedProperties filter for card_updated trigger
    // Trello webhook payload includes action.data.old with ONLY changed field keys
    const watchedProperties = config.watchedProperties
    if (watchedProperties && Array.isArray(watchedProperties) && watchedProperties.length > 0) {
      const changedFields = event.eventData?.changedFields ||
        (event.eventData?._oldData ? Object.keys(event.eventData._oldData) : [])
      if (changedFields.length > 0) {
        const hasWatchedChange = changedFields.some((field: string) => watchedProperties.includes(field))
        if (!hasWatchedChange) {
          return false
        }
      }
    }

    // watchedLists filter for card_moved trigger
    const watchedLists = config.watchedLists
    if (watchedLists && Array.isArray(watchedLists) && watchedLists.length > 0) {
      const fromListId = event.eventData?.fromListId || event.eventData?._listBeforeId
      const toListId = event.eventData?.toListId || event.eventData?._listAfterId
      const involvedLists = [fromListId, toListId].filter(Boolean).map(String)
      if (involvedLists.length > 0) {
        const hasWatchedList = involvedLists.some((id: string) => watchedLists.includes(id))
        if (!hasWatchedList) {
          return false
        }
      }
    }

    // cardId filter for comment_added trigger
    const cardFilter = config.cardId || config.card_id
    if (cardFilter) {
      const eventCardId = event.eventData?.cardId || event.eventData?.card_id
      if (eventCardId && String(eventCardId) !== String(cardFilter)) {
        return false
      }
    }
  }

  // Notion specific filters (API version 2025-09-03 with data sources)
  if (event.provider === 'notion') {
    // Filter by data source ID (new in 2025-09-03)
    if (config.dataSourceId && event.eventData.data?.parent?.data_source_id) {
      if (event.eventData.data.parent.data_source_id !== config.dataSourceId) {
        return false
      }
    }

    // Fallback: Filter by database if specified (backwards compatibility)
    if (config.database) {
      const eventDatabaseId = event.eventData.databaseId ||
                             event.eventData.data?.parent?.id ||
                             event.eventData.entity?.id
      if (eventDatabaseId && eventDatabaseId !== config.database) {
        return false
      }
    }

    // Filter by workspace if specified
    if (config.workspace && event.eventData.workspace_id) {
      if (event.eventData.workspace_id !== config.workspace) {
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
    
    logger.info(`✅ Workflow "${workflow.name}" executed successfully with webhook data`)
    return result
    
  } catch (error) {
    logger.error(`❌ Failed to execute workflow "${workflow.name}":`, error)
    throw error
  }
}

/**
 * Store webhook event for audit trail
 */
async function storeWebhookEvent(event: WebhookEvent, dedupeKey?: string | null, existingClient?: Awaited<ReturnType<typeof createSupabaseServiceClient>> | null): Promise<void> {
  try {
    const supabase = existingClient || await createSupabaseServiceClient()
    let eventDataToStore: any = event.eventData

    if (event.requestId && typeof eventDataToStore === 'object' && eventDataToStore !== null) {
      eventDataToStore = {
        ...eventDataToStore,
        _meta: {
          ...(eventDataToStore._meta || {}),
          originalRequestId: event.requestId
        }
      }
    }

    await supabase
      .from('webhook_events')
      .insert({
        provider: event.provider,
        service: event.service,
        event_data: eventDataToStore,
        request_id: dedupeKey || event.requestId,
        status: 'received',
        timestamp: event.timestamp
      })
  } catch (error) {
    logger.error('Failed to store webhook event:', error)
    // Don't throw - this shouldn't block execution
  }
}

// Provider-specific processors
export async function processDiscordEvent(event: WebhookEvent): Promise<any> {
  logger.info('Processing Discord message with length:', event.eventData.content?.length || 0)
  return await processWebhookEvent(event)
}

export async function processSlackEvent(event: WebhookEvent): Promise<any> {
  logger.info('Processing Slack message with length:', event.eventData.text?.length || 0)
  return await processWebhookEvent(event)
}

export async function processGitHubEvent(event: WebhookEvent): Promise<any> {
  logger.info('Processing GitHub event:', event.eventType)
  return await processWebhookEvent(event)
}

export async function processNotionEvent(event: WebhookEvent): Promise<any> {
  logger.info('Processing Notion event:', event.eventType)
  return await processWebhookEvent(event)
} 
