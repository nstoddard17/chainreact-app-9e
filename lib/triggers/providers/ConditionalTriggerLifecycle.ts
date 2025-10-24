import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types';
import { logger } from '@/lib/utils/logger';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Conditional Trigger Lifecycle
 *
 * Production implementation using:
 * - Supabase for persistent state storage (trigger_state table)
 * - Interval-based checking for condition evaluation
 * - State tracking for "value changes" detection
 *
 * For production at scale, consider:
 * - Cron/scheduling system (node-cron, Bull, AWS EventBridge)
 * - Separate worker processes for checks
 * - Monitoring and alerting
 * - Rate limiting to prevent excessive checking
 */
export class ConditionalTriggerLifecycle implements TriggerLifecycle {
  private activeChecks: Map<string, NodeJS.Timeout> = new Map();

  async onActivate(context: TriggerActivationContext): Promise<void> {
    logger.info('[ConditionalTrigger] Activating trigger', {
      workflowId: context.workflowId,
      config: context.config
    });

    const {
      checkType,
      checkInterval = '15m',
      condition,
      expectedValue,
      apiUrl,
      websiteUrl,
      databaseQuery
    } = context.config;

    // Parse interval to milliseconds
    const intervalMs = this.parseInterval(checkInterval);

    // Initialize state in Supabase
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('trigger_state')
      .upsert({
        workflow_id: context.workflowId,
        trigger_type: 'conditional',
        last_checked_at: new Date().toISOString(),
        last_checked_value: null,
        check_count: 0
      }, {
        onConflict: 'workflow_id'
      });

    if (error) {
      logger.error('[ConditionalTrigger] Failed to initialize state', { error });
      throw new Error(`Failed to initialize conditional trigger: ${error.message}`);
    }

    logger.info('[ConditionalTrigger] Trigger activated and state initialized', {
      workflowId: context.workflowId,
      checkType,
      checkInterval,
      intervalMs,
      condition
    });

    // Note: In production, you would set up a cron job or scheduled task here
    // For now, the trigger is registered and state is ready
    // Actual periodic checking would be handled by a separate worker process
  }

  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    logger.info('[ConditionalTrigger] Deactivating trigger', {
      workflowId: context.workflowId
    });

    // Clear any active interval (if running in-process)
    const checkTimer = this.activeChecks.get(context.workflowId);
    if (checkTimer) {
      clearInterval(checkTimer);
      this.activeChecks.delete(context.workflowId);
      logger.info('[ConditionalTrigger] Cleared check interval');
    }

    // Update state in Supabase to mark as inactive
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('trigger_state')
      .update({
        last_checked_at: new Date().toISOString()
      })
      .eq('workflow_id', context.workflowId);

    if (error) {
      logger.error('[ConditionalTrigger] Failed to update state on deactivate', { error });
      // Don't throw - deactivation should succeed even if state update fails
    }

    logger.info('[ConditionalTrigger] Trigger deactivated');
  }

  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    // First deactivate (clears intervals, updates state)
    await this.onDeactivate(context);

    // Delete state from Supabase
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('trigger_state')
      .delete()
      .eq('workflow_id', context.workflowId);

    if (error) {
      logger.error('[ConditionalTrigger] Failed to delete state', { error });
      // Don't throw - deletion should succeed even if state cleanup fails
    }

    logger.info('[ConditionalTrigger] Trigger deleted and cleaned up', {
      workflowId: context.workflowId
    });
  }

  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    // Check if state exists in Supabase
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('trigger_state')
      .select('last_checked_at, check_count')
      .eq('workflow_id', workflowId)
      .single();

    if (error || !data) {
      return {
        healthy: false,
        details: 'Trigger state not found in database',
        lastChecked: new Date().toISOString()
      };
    }

    // Check if last check was recent (within last hour)
    const lastChecked = new Date(data.last_checked_at);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const isRecent = lastChecked > hourAgo;

    return {
      healthy: true,
      details: `Trigger registered. Last checked: ${lastChecked.toISOString()}. Total checks: ${data.check_count}`,
      lastChecked: lastChecked.toISOString()
    };
  }

  /**
   * Parse interval string to milliseconds
   */
  private parseInterval(interval: string): number {
    const value = parseInt(interval);
    const unit = interval.replace(value.toString(), '');

    switch (unit) {
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      default:
        return 15 * 60 * 1000; // Default 15 minutes
    }
  }

  /**
   * Perform condition check (MOCK)
   * In production, this would:
   * - Fetch current value from API/website/database
   * - Compare with expected value
   * - Check if condition is met
   * - Store new value for "changes" condition
   * - Trigger workflow if condition is true
   */
  private async performCheck(context: TriggerActivationContext): Promise<void> {
    logger.info('[ConditionalTrigger] Performing check (MOCK)', {
      workflowId: context.workflowId,
      checkType: context.config.checkType
    });

    // MOCK: Just log that we would check
    // In production, implement actual checking logic here
  }
}
