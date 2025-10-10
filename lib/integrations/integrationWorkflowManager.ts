import { createSupabaseServiceClient } from '@/utils/supabase/server'

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
    console.warn('[IntegrationWorkflowManager] Could not resolve integration details', { integrationId, error })
    return null
  }

  return {
    integrationId: data.id,
    provider: data.provider,
    userId: data.user_id
  }
}

async function updateWorkflowRecords(updates: Array<{ id: string; nodes: any; metadata: any }>) {
  if (updates.length === 0) return
  const supabase = await createSupabaseServiceClient()

  for (const record of updates) {
    const { error } = await supabase
      .from('workflows')
      .update({ nodes: record.nodes, metadata: record.metadata })
      .eq('id', record.id)

    if (error) {
      console.error('[IntegrationWorkflowManager] Failed to update workflow', {
        workflowId: record.id,
        error
      })
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
      console.error('[IntegrationWorkflowManager] Failed to update webhook config', {
        webhookConfigId: config.id,
        error
      })
    }
  }
}

function markNodeForReconnect(node: any, provider: string): { node: any; changed: boolean } {
  if (!node || typeof node !== 'object') return { node, changed: false }

  const data = node.data || {}
  const providerMatches = data.providerId === provider || data.provider_id === provider
  const configMatches = data.provider === provider || node.provider === provider || node?.data?.config?.provider === provider

  if (!providerMatches && !configMatches) {
    return { node, changed: false }
  }

  const integrationWarnings = { ...(data.integrationReconnectWarnings || {}) }

  if (integrationWarnings[provider]) {
    return { node, changed: false }
  }

  integrationWarnings[provider] = true

  return {
    node: {
      ...node,
      data: {
        ...data,
        integrationReconnectWarnings: integrationWarnings
      }
    },
    changed: true
  }
}

function clearNodeReconnectFlag(node: any, provider: string): { node: any; changed: boolean } {
  if (!node || typeof node !== 'object' || !node.data?.integrationReconnectWarnings) {
    return { node, changed: false }
  }

  const warnings = { ...node.data.integrationReconnectWarnings }
  if (!warnings[provider]) {
    return { node, changed: false }
  }

  delete warnings[provider]

  const updatedData = { ...node.data }
  if (Object.keys(warnings).length === 0) {
    delete updatedData.integrationReconnectWarnings
  } else {
    updatedData.integrationReconnectWarnings = warnings
  }

  return {
    node: {
      ...node,
      data: updatedData
    },
    changed: true
  }
}

async function processWorkflows(
  userId: string,
  provider: string,
  modifier: (node: any) => { node: any; changed: boolean },
  metadataUpdater: (metadata: any) => { metadata: any; changed: boolean }
) {
  const supabase = await createSupabaseServiceClient()
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('id, nodes, metadata')
    .eq('user_id', userId)

  if (error || !workflows || workflows.length === 0) {
    return { updated: 0 }
  }

  const updates: Array<{ id: string; nodes: any; metadata: any }> = []

  for (const workflow of workflows as WorkflowRecord[]) {
    const nodesArray = ensureArray(workflow.nodes)
    if (nodesArray.length === 0) continue

    let nodesChanged = false
    const updatedNodes = nodesArray.map((node) => {
      const { node: updatedNode, changed } = modifier(node)
      if (changed) nodesChanged = true
      return updatedNode
    })

    if (!nodesChanged) continue

    const metadata = workflow.metadata ?? {}
    const parsedMetadata = parseJsonValue<any>(metadata) || (typeof metadata === 'object' ? metadata : {})
    const { metadata: updatedMetadata, changed: metadataChanged } = metadataUpdater({ ...parsedMetadata })

    updates.push({ id: workflow.id, nodes: updatedNodes, metadata: metadataChanged ? updatedMetadata : parsedMetadata })
  }

  await updateWorkflowRecords(updates)

  return { updated: updates.length }
}

export async function flagIntegrationWorkflows(options: FlagOptions) {
  const resolved = await resolveIntegrationDetails(options)
  if (!resolved) {
    console.warn('[IntegrationWorkflowManager] Unable to flag workflows – missing integration context', options)
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
    console.warn('[IntegrationWorkflowManager] Unable to clear workflow flags – missing integration context', options)
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
