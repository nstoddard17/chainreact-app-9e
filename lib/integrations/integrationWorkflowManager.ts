import { createSupabaseServiceClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

interface FlagOptions {
  integrationId?: string
  provider?: string
  userId?: string
  reason?: string
}

interface ClearOptions {
  integrationId?: string
  provider?: string
  userId?: string
}

type WorkflowRecord = {
  id: string
  nodes: any
  metadata?: any
}

function parseJsonValue<T>(value: any): T | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object') return value as T
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return undefined
    }
  }
  return undefined
}

function ensureArray(value: any): any[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

async function resolveIntegrationDetails(options: FlagOptions | ClearOptions) {
  const { integrationId, provider, userId } = options

  if (integrationId && provider && userId) {
    return { integrationId, provider, userId }
  }

  if (!integrationId) {
    return null
  }

  const supabase = await createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('integrations')
    .select('id, user_id, provider')
    .eq('id', integrationId)
    .single()

  if (error || !data) {
    logger.warn('[IntegrationWorkflowManager] Could not resolve integration details', { integrationId, error })
    return null
  }

  return {
    integrationId: data.id,
    provider: data.provider,
    userId: data.user_id
  }
}

async function updateWorkflowRecords(updates: Array<{ id: string; nodeUpdates: Array<{ nodeId: string; config: any }>; metadata: any }>) {
  if (updates.length === 0) return
  const supabase = await createSupabaseServiceClient()

  for (const record of updates) {
    // Update workflow metadata
    const { error: metaError } = await supabase
      .from('workflows')
      .update({ metadata: record.metadata })
      .eq('id', record.id)

    if (metaError) {
      logger.error('[IntegrationWorkflowManager] Failed to update workflow metadata', {
        workflowId: record.id,
        error: metaError
      })
    }

    // Update each node's config in workflow_nodes table
    for (const nodeUpdate of record.nodeUpdates) {
      const { error: nodeError } = await supabase
        .from('workflow_nodes')
        .update({ config: nodeUpdate.config, updated_at: new Date().toISOString() })
        .eq('id', nodeUpdate.nodeId)

      if (nodeError) {
        logger.error('[IntegrationWorkflowManager] Failed to update node config', {
          nodeId: nodeUpdate.nodeId,
          error: nodeError
        })
      }
    }
  }
}

async function updateWebhookStatuses(userId: string, provider: string, status: 'needs_reconnect' | 'active') {
  const supabase = await createSupabaseServiceClient()

  const { data: configs } = await supabase
    .from('webhook_configs')
    .select('id, config')
    .eq('user_id', userId)
    .eq('provider_id', provider)

  if (!configs || configs.length === 0) {
    return
  }

  for (const config of configs) {
    const configJson = parseJsonValue<any>(config.config) || (typeof config.config === 'object' ? config.config : {})

    const warnings = { ...(configJson.integrationReconnectWarnings || {}) }

    if (status === 'needs_reconnect') {
      warnings[provider] = true
      configJson.integrationReconnectWarnings = warnings
    } else {
      if (warnings[provider]) {
        delete warnings[provider]
        if (Object.keys(warnings).length === 0) {
          delete configJson.integrationReconnectWarnings
        } else {
          configJson.integrationReconnectWarnings = warnings
        }
      }
    }

    const webhookStatus = status === 'needs_reconnect' ? 'error' : 'active'

    const { error } = await supabase
      .from('webhook_configs')
      .update({ status: webhookStatus, config: configJson })
      .eq('id', config.id)

    if (error) {
      logger.error('[IntegrationWorkflowManager] Failed to update webhook config', {
        webhookConfigId: config.id,
        error
      })
    }
  }
}

function markNodeForReconnect(node: any, provider: string): { node: any; configUpdate: { nodeId: string; config: any } | null; changed: boolean } {
  if (!node || typeof node !== 'object') return { node, configUpdate: null, changed: false }

  // Node from workflow_nodes table has provider_id directly
  const providerMatches = node.provider_id === provider
  const config = node.config || {}
  const configMatches = config.provider === provider

  if (!providerMatches && !configMatches) {
    return { node, configUpdate: null, changed: false }
  }

  const integrationWarnings = { ...(config.integrationReconnectWarnings || {}) }

  if (integrationWarnings[provider]) {
    return { node, configUpdate: null, changed: false }
  }

  integrationWarnings[provider] = true

  const updatedConfig = {
    ...config,
    integrationReconnectWarnings: integrationWarnings
  }

  return {
    node: {
      ...node,
      config: updatedConfig
    },
    configUpdate: { nodeId: node.id, config: updatedConfig },
    changed: true
  }
}

function clearNodeReconnectFlag(node: any, provider: string): { node: any; configUpdate: { nodeId: string; config: any } | null; changed: boolean } {
  if (!node || typeof node !== 'object') {
    return { node, configUpdate: null, changed: false }
  }

  const config = node.config || {}
  if (!config.integrationReconnectWarnings) {
    return { node, configUpdate: null, changed: false }
  }

  const warnings = { ...config.integrationReconnectWarnings }
  if (!warnings[provider]) {
    return { node, configUpdate: null, changed: false }
  }

  delete warnings[provider]

  const updatedConfig = { ...config }
  if (Object.keys(warnings).length === 0) {
    delete updatedConfig.integrationReconnectWarnings
  } else {
    updatedConfig.integrationReconnectWarnings = warnings
  }

  return {
    node: {
      ...node,
      config: updatedConfig
    },
    configUpdate: { nodeId: node.id, config: updatedConfig },
    changed: true
  }
}

async function processWorkflows(
  userId: string,
  provider: string,
  modifier: (node: any) => { node: any; configUpdate: { nodeId: string; config: any } | null; changed: boolean },
  metadataUpdater: (metadata: any) => { metadata: any; changed: boolean }
) {
  const supabase = await createSupabaseServiceClient()

  // Get workflows for this user
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('id, metadata')
    .eq('user_id', userId)

  if (error || !workflows || workflows.length === 0) {
    return { updated: 0 }
  }

  // Get all nodes for these workflows from normalized table
  const workflowIds = workflows.map(w => w.id)
  const { data: allNodes, error: nodesError } = await supabase
    .from('workflow_nodes')
    .select('id, workflow_id, node_type, label, config, is_trigger, provider_id')
    .in('workflow_id', workflowIds)

  if (nodesError) {
    logger.error('[IntegrationWorkflowManager] Failed to load workflow nodes', { error: nodesError })
    return { updated: 0 }
  }

  // Group nodes by workflow
  const nodesByWorkflow = new Map<string, any[]>()
  for (const node of allNodes || []) {
    const list = nodesByWorkflow.get(node.workflow_id) || []
    list.push(node)
    nodesByWorkflow.set(node.workflow_id, list)
  }

  const updates: Array<{ id: string; nodeUpdates: Array<{ nodeId: string; config: any }>; metadata: any }> = []

  for (const workflow of workflows) {
    const nodes = nodesByWorkflow.get(workflow.id) || []
    if (nodes.length === 0) continue

    const nodeUpdates: Array<{ nodeId: string; config: any }> = []
    let nodesChanged = false

    for (const node of nodes) {
      const { configUpdate, changed } = modifier(node)
      if (changed && configUpdate) {
        nodesChanged = true
        nodeUpdates.push(configUpdate)
      }
    }

    if (!nodesChanged) continue

    const metadata = workflow.metadata ?? {}
    const parsedMetadata = parseJsonValue<any>(metadata) || (typeof metadata === 'object' ? metadata : {})
    const { metadata: updatedMetadata, changed: metadataChanged } = metadataUpdater({ ...parsedMetadata })

    updates.push({ id: workflow.id, nodeUpdates, metadata: metadataChanged ? updatedMetadata : parsedMetadata })
  }

  await updateWorkflowRecords(updates)

  return { updated: updates.length }
}

export async function flagIntegrationWorkflows(options: FlagOptions) {
  const resolved = await resolveIntegrationDetails(options)
  if (!resolved) {
    logger.warn('[IntegrationWorkflowManager] Unable to flag workflows – missing integration context', options)
    return { updated: 0 }
  }

  const { integrationId, provider, userId } = resolved
  const supabase = await createSupabaseServiceClient()

  if (integrationId) {
    await supabase
      .from('integrations')
      .update({
        status: 'needs_reconnect',
        disconnect_reason: options.reason || 'Authentication expired',
        updated_at: new Date().toISOString()
      })
      .eq('id', integrationId)
  }

  const { updated } = await processWorkflows(
    userId,
    provider,
    (node) => markNodeForReconnect(node, provider),
    (metadata) => {
      const providers = new Set<string>(metadata.integrationReconnectProviders || [])
      const sizeBefore = providers.size
      providers.add(provider)
      metadata.integrationReconnectProviders = Array.from(providers)
      return { metadata, changed: providers.size !== sizeBefore }
    }
  )

  await updateWebhookStatuses(userId, provider, 'needs_reconnect')

  return { updated }
}

export async function clearIntegrationWorkflowFlags(options: ClearOptions) {
  const resolved = await resolveIntegrationDetails(options)
  if (!resolved) {
    logger.warn('[IntegrationWorkflowManager] Unable to clear workflow flags – missing integration context', options)
    return { cleared: 0 }
  }

  const { integrationId, provider, userId } = resolved
  const supabase = await createSupabaseServiceClient()

  if (integrationId) {
    await supabase
      .from('integrations')
      .update({
        status: 'connected',
        disconnect_reason: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', integrationId)
  }

  const { updated } = await processWorkflows(
    userId,
    provider,
    (node) => clearNodeReconnectFlag(node, provider),
    (metadata) => {
      const providers = new Set<string>(metadata.integrationReconnectProviders || [])
      const sizeBefore = providers.size
      providers.delete(provider)
      if (providers.size === 0) {
        delete metadata.integrationReconnectProviders
      } else {
        metadata.integrationReconnectProviders = Array.from(providers)
      }
      return { metadata, changed: providers.size !== sizeBefore }
    }
  )

  await updateWebhookStatuses(userId, provider, 'active')

  return { cleared: updated }
}
