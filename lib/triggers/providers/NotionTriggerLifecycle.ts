import { TriggerLifecycle, TriggerActivationContext, TriggerDeactivationContext, TriggerHealthStatus } from '../types'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { decrypt } from '@/lib/security/encryption'
import { getWebhookUrl } from '@/lib/utils/getBaseUrl'

import { logger } from '@/lib/utils/logger'

/**
 * Notion Trigger Lifecycle Manager
 *
 * Manages webhook subscriptions for Notion triggers.
 * Note: Notion doesn't have a native webhook API yet, so this implementation
 * uses a polling strategy or waits for Notion's webhook support.
 *
 * For now, we'll log the setup but not create actual subscriptions since
 * Notion doesn't support webhooks in their public API yet.
 */
export class NotionTriggerLifecycle implements TriggerLifecycle {

  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.info('[Notion Trigger] Activating trigger')

    // Get Notion integration
    const supabase = await createSupabaseServerClient()
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'notion')
      .eq('status', 'connected')
      .single()

    if (!integration) {
      throw new Error('Notion integration not found or not connected')
    }

    // Get workspace access token
    const workspaceId = config?.workspace
    if (!workspaceId) {
      throw new Error('Workspace ID is required for Notion triggers')
    }

    const workspaces = integration.metadata?.workspaces || {}
    const workspace = workspaces[workspaceId]

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found in integration`)
    }

    // Decrypt access token
    const encryptionKey = process.env.ENCRYPTION_KEY!
    const accessToken = decrypt(workspace.access_token, encryptionKey)

    // Get database and data source info using new API (2025-09-03)
    const databaseId = config?.database
    let dataSourceId = config?.dataSource // New field for data source

    if (databaseId && !dataSourceId) {
      // Fetch data source ID from database
      try {
        // Add timeout to prevent hanging on slow API responses
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

        const dbResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Notion-Version': '2025-09-03',
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (dbResponse.ok) {
          const dbData = await dbResponse.json()
          // Get the first (or default) data source
          if (dbData.data_sources && dbData.data_sources.length > 0) {
            dataSourceId = dbData.data_sources[0].id
            logger.info('[Notion Trigger] Auto-detected data source for trigger activation')
          }
        }
      } catch (err) {
        // Log error without sensitive details
        logger.warn('[Notion Trigger] Failed to fetch data source metadata, using database ID fallback')
      }
    }

    // Create webhook via Notion API
    const webhookUrl = getWebhookUrl('notion')
    const eventTypes = this.getNotionEventTypes(triggerType)

    logger.info('[Notion Trigger] Creating webhook with URL:', webhookUrl)
    logger.info('[Notion Trigger] Event types:', eventTypes)
    logger.info('[Notion Trigger] Target:', dataSourceId ? `data_source ${dataSourceId}` : `database ${databaseId}`)

    // Validate webhook URL (Notion requires HTTPS)
    if (!webhookUrl.startsWith('https://')) {
      throw new Error(`Webhook URL must be HTTPS, got: ${webhookUrl}`)
    }

    let webhookId: string
    try {
      const requestBody = {
        url: webhookUrl,
        event_types: eventTypes,
        // If we have a data source, subscribe to it; otherwise subscribe to the database
        ...(dataSourceId ? {
          data_source_id: dataSourceId
        } : {
          database_id: databaseId
        })
      }

      logger.info('[Notion Trigger] Webhook request body:', JSON.stringify(requestBody))

      const webhookResponse = await fetch('https://api.notion.com/v1/webhooks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Notion-Version': '2025-09-03',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text()
        throw new Error(`Notion API error: ${webhookResponse.status} - ${errorText}`)
      }

      const webhookData = await webhookResponse.json()
      webhookId = webhookData.id

      logger.info('[Notion Trigger] Webhook created successfully')
    } catch (webhookError: any) {
      logger.error('[Notion Trigger] Failed to create webhook')
      throw new Error(`Failed to create Notion webhook: ${webhookError.message}`)
    }

    // Store trigger configuration for webhook processing
    const { data: resource, error } = await supabase
      .from('trigger_resources')
      .insert({
        workflow_id: workflowId,
        user_id: userId,
        node_id: nodeId,
        provider_id: 'notion',
        trigger_type: triggerType,
        resource_type: 'webhook',
        external_id: webhookId, // Use actual Notion webhook ID
        status: 'active',
        config: {
          workspace: workspaceId,
          database: databaseId,
          dataSourceId: dataSourceId // Store data source ID for filtering (matches processor expectations)
        },
        metadata: {
          webhookUrl: webhookUrl,
          apiVersion: '2025-09-03',
          eventTypes: eventTypes,
          createdProgrammatically: true
        }
      })
      .select()
      .single()

    if (error) {
      // If storing failed, try to clean up the webhook we just created
      try {
        await fetch(`https://api.notion.com/v1/webhooks/${webhookId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Notion-Version': '2025-09-03'
          }
        })
      } catch (cleanupError) {
        logger.warn('[Notion Trigger] Failed to cleanup webhook after storage error')
      }

      logger.error('[Notion Trigger] Failed to store trigger resource')
      throw new Error(`Failed to activate Notion trigger: ${error.message}`)
    }

    logger.info('[Notion Trigger] Trigger activated with programmatic webhook')
  }

  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    logger.info('[Notion Trigger] Deactivating triggers')

    const supabase = await createSupabaseServerClient()

    // Get trigger resources to find webhook IDs
    const { data: resources, error: queryError } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'notion')

    if (queryError) {
      logger.error('[Notion Trigger] Failed to query trigger resources')
      throw new Error(`Failed to deactivate Notion triggers: ${queryError.message}`)
    }

    // Delete webhooks from Notion API
    if (resources && resources.length > 0) {
      // Get integration to fetch access token
      const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'notion')
        .eq('status', 'connected')
        .single()

      if (integration) {
        const workspaceId = resources[0].config?.workspace
        const workspaces = integration.metadata?.workspaces || {}
        const workspace = workspaces[workspaceId]

        if (workspace) {
          const encryptionKey = process.env.ENCRYPTION_KEY!
          const accessToken = decrypt(workspace.access_token, encryptionKey)

          // Delete each webhook
          for (const resource of resources) {
            const webhookId = resource.external_id
            try {
              await fetch(`https://api.notion.com/v1/webhooks/${webhookId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Notion-Version': '2025-09-03'
                }
              })
              logger.info('[Notion Trigger] Webhook deleted from Notion')
            } catch (webhookError) {
              logger.warn('[Notion Trigger] Failed to delete webhook from Notion, continuing cleanup')
            }
          }
        }
      }
    }

    // Delete trigger resources from database
    const { error } = await supabase
      .from('trigger_resources')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'notion')

    if (error) {
      logger.error('[Notion Trigger] Failed to delete trigger resources')
      throw new Error(`Failed to deactivate Notion triggers: ${error.message}`)
    }

    logger.info('[Notion Trigger] Triggers deactivated')
  }

  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    // Same as deactivate for Notion
    await this.onDeactivate(context)
  }

  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const supabase = await createSupabaseServerClient()

    // Check if trigger resources exist
    const { data: resources, error } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'notion')

    if (error) {
      return {
        healthy: false,
        details: `Health check failed: ${error.message}`,
        lastChecked: new Date().toISOString()
      }
    }

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No Notion trigger resources found',
        lastChecked: new Date().toISOString()
      }
    }

    // Check if Notion integration is still connected
    const { data: integration } = await supabase
      .from('integrations')
      .select('status')
      .eq('user_id', userId)
      .eq('provider', 'notion')
      .single()

    if (!integration || integration.status !== 'connected') {
      return {
        healthy: false,
        details: 'Notion integration is not connected - please reconnect',
        lastChecked: new Date().toISOString()
      }
    }

    return {
      healthy: true,
      details: 'Notion triggers are configured (manual webhook setup required)',
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Get Notion API event types for webhook subscription
   * These are the actual event types Notion API expects
   */
  private getNotionEventTypes(triggerType: string): string[] {
    switch (triggerType) {
      case 'notion_trigger_new_page':
        return ['page.created']
      case 'notion_trigger_page_updated':
        return ['page.content_updated', 'page.property_values_updated']
      case 'notion_trigger_comment_added':
        return ['comment.created']
      default:
        return []
    }
  }

  /**
   * Get supported events for documentation/metadata
   * @deprecated Use getNotionEventTypes for actual API calls
   */
  private getSupportedEventsForTrigger(triggerType: string): string[] {
    return this.getNotionEventTypes(triggerType)
  }
}
