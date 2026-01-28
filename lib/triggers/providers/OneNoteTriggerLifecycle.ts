/**
 * OneNote Trigger Lifecycle
 *
 * Manages polling-based triggers for Microsoft OneNote.
 * No external webhooks needed - uses polling system since Microsoft Graph
 * does not support direct OneNote webhooks (deprecated May 2023).
 */

import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphAuth } from '@/lib/microsoft-graph/auth'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'
import { logger } from '@/lib/utils/logger'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export class OneNoteTriggerLifecycle implements TriggerLifecycle {
  private graphAuth = new MicrosoftGraphAuth()

  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config, testMode } = context

    const modeLabel = testMode ? '[TEST]' : '[PRODUCTION]'
    logger.debug(`${modeLabel} Activating OneNote polling trigger for workflow ${workflowId}`, {
      triggerType,
      configKeys: Object.keys(config || {})
    })

    // Verify token is valid and has OneNote permissions
    try {
      const accessToken = await this.graphAuth.getValidAccessToken(userId, 'microsoft-onenote')

      // Test permissions by fetching notebooks
      const response = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks?$top=1', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!response.ok) {
        throw new Error(`Token lacks OneNote permissions. Status: ${response.status}`)
      }

      logger.debug('[OneNote] Token verified with OneNote permissions')
    } catch (error) {
      logger.error('[OneNote] Failed to verify OneNote token:', error)
      throw new Error('Microsoft OneNote integration not connected or token expired. Please reconnect your Microsoft OneNote account.')
    }

    // Store polling trigger resource
    const resourceId = `poll-${workflowId}-${nodeId}`
    const { error: insertError } = await getSupabase().from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'microsoft-onenote',
      provider_id: 'microsoft-onenote',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'polling',
      resource_id: resourceId, // Generated ID for polling triggers
      config: {
        ...config,
        pollingEnabled: true
      },
      status: 'active',
      is_test: testMode?.isTest ?? false,
      test_session_id: testMode?.testSessionId ?? null
    })

    if (insertError) {
      if (insertError.code === '23503') {
        logger.warn(`[OneNote] Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        return
      }
      logger.error('[OneNote] Failed to store trigger resource:', insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    logger.debug(`[OneNote] Polling trigger activated for workflow ${workflowId}`)
  }

  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, nodeId, testSessionId } = context

    const modeLabel = testSessionId ? '[TEST]' : nodeId ? '[NODE]' : '[PRODUCTION]'
    logger.debug(`${modeLabel} Deactivating OneNote triggers for workflow ${workflowId}${nodeId ? ` node ${nodeId}` : ''}`)

    let query = getSupabase()
      .from('trigger_resources')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'microsoft-onenote')

    if (nodeId) {
      query = query.eq('node_id', nodeId)
    } else if (testSessionId) {
      query = query.eq('test_session_id', testSessionId)
    } else {
      query = query.or('is_test.is.null,is_test.eq.false')
    }

    const { error } = await query

    if (error) {
      logger.error('[OneNote] Failed to delete trigger resources:', error)
    } else {
      logger.debug(`[OneNote] Polling triggers deactivated for workflow ${workflowId}`)
    }
  }

  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'microsoft-onenote')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active polling triggers found',
        lastChecked: new Date().toISOString()
      }
    }

    // Polling triggers are always healthy if they exist
    return {
      healthy: true,
      details: `${resources.length} polling trigger(s) active`,
      lastChecked: new Date().toISOString()
    }
  }

  getResourceIdentityKeys(): string[] {
    return ['notebookId', 'sectionId']
  }
}
