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

    // Store trigger configuration for webhook processing
    // Since Notion doesn't support native webhooks, we'll store the config
    // and rely on manual webhook setup or polling
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
          databaseId: trigger.config?.database,
          triggerType: trigger.type,
          triggerId: trigger.id
        },
        metadata: {
          note: 'Notion webhooks must be manually configured in Notion integration settings',
          webhookUrl: getWebhookUrl('/api/webhooks/notion'),
          supportedEvents: this.getSupportedEventsForTrigger(trigger.type)
        }
      })
      .select()
      .single()

    if (error) {
      logger.error('❌ [Notion Trigger] Failed to store trigger resource:', error)
      throw new Error(`Failed to activate Notion trigger: ${error.message}`)
    }

    logger.info('✅ [Notion Trigger] Trigger activated (manual webhook setup required)', {
      resourceId: resource.id,
      webhookUrl: getWebhookUrl('/api/webhooks/notion'),
      instructions: [
        '1. Go to https://www.notion.so/my-integrations',
        '2. Select your integration',
        '3. Add webhook URL: ' + getWebhookUrl('/api/webhooks/notion'),
        '4. Subscribe to relevant events',
        '5. Test the webhook'
      ]
    })
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
