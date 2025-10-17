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
    const { workflowId, userId, trigger } = context

    logger.info('📝 [Notion Trigger] Activating trigger', {
      workflowId,
      triggerType: trigger.type,
      triggerConfig: trigger.config
    })

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
    const workspaceId = trigger.config?.workspace
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
    const databaseId = trigger.config?.database
    let dataSourceId = trigger.config?.dataSource // New field for data source

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

    // Store trigger configuration for webhook processing
    const { data: resource, error } = await supabase
      .from('trigger_resources')
      .insert({
        workflow_id: workflowId,
        provider: 'notion',
        resource_type: trigger.type,
        external_id: `notion-${workflowId}-${trigger.id}`,
        status: 'active',
        config: {
          workspaceId,
          databaseId,
          dataSourceId, // Store data source ID for filtering
          triggerType: trigger.type,
          triggerId: trigger.id
        },
        metadata: {
          note: 'Notion webhooks configured for API version 2025-09-03',
          webhookUrl: getWebhookUrl('/api/webhooks/notion'),
          apiVersion: '2025-09-03',
          supportedEvents: this.getSupportedEventsForTrigger(trigger.type),
          instructions: [
            '1. Go to https://www.notion.so/my-integrations',
            '2. Select your integration',
            '3. Add webhook URL: ' + getWebhookUrl('/api/webhooks/notion'),
            '4. Set API version to 2025-09-03',
            '5. Subscribe to data_source events (not database events)',
            '6. Test the webhook'
          ]
        }
      })
      .select()
      .single()

    if (error) {
      logger.error('❌ [Notion Trigger] Failed to store trigger resource:', error)
      throw new Error(`Failed to activate Notion trigger: ${error.message}`)
    }

    logger.info('[Notion Trigger] Trigger activated with data source support')
  }

  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    logger.info('📝 [Notion Trigger] Deactivating triggers', { workflowId })

    // Delete trigger resources
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('trigger_resources')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('provider', 'notion')

    if (error) {
      logger.error('❌ [Notion Trigger] Failed to delete trigger resources:', error)
      throw new Error(`Failed to deactivate Notion triggers: ${error.message}`)
    }

    logger.info('✅ [Notion Trigger] Triggers deactivated', { workflowId })
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
      .eq('provider', 'notion')

    if (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error.message}`
      }
    }

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        message: 'No Notion trigger resources found'
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
        message: 'Notion integration is not connected',
        requiresReconnection: true
      }
    }

    return {
      healthy: true,
      message: 'Notion triggers are configured (manual webhook setup required)',
      details: {
        resourceCount: resources.length,
        webhookUrl: getWebhookUrl('/api/webhooks/notion')
      }
    }
  }

  private getSupportedEventsForTrigger(triggerType: string): string[] {
    switch (triggerType) {
      case 'notion_trigger_new_page':
        return ['page.created', 'database_item.created']
      case 'notion_trigger_page_updated':
        return ['page.updated', 'database_item.updated']
      case 'notion_trigger_comment_added':
        return ['comment.created']
      default:
        return []
    }
  }
}
