/**
 * UserDeletionService
 *
 * Centralized service for user data deletion across all pathways:
 * - Admin hard delete
 * - GDPR full deletion
 * - GDPR partial deletion
 * - GDPR anonymization
 *
 * Tables are organized into dependency-respecting "waves" that run in parallel
 * within each wave, and sequentially across waves.
 */

import { SupabaseClient, createClient } from '@supabase/supabase-js'
import { triggerLifecycleManager } from '@/lib/triggers/TriggerLifecycleManager'
import { logger } from '@/lib/utils/logger'

export type DeletionMode = 'full' | 'partial' | 'anonymize'

export interface DeletionResult {
  success: boolean
  tablesProcessed: number
  errors: Array<{ table: string; error: string }>
  webhookCleanupErrors: string[]
}

interface TableDeletion {
  table: string
  column: string // user_id column name
  byWorkflowIds?: boolean // if true, delete by workflow_id IN (...) instead of user_id
  modes: DeletionMode[] // which modes include this table
}

interface TableAnonymization {
  table: string
  column: string
  fields: Record<string, any>
  modes: DeletionMode[]
}

// Tables deleted in Wave 1 (deepest children, no dependents)
const WAVE_1_DELETIONS: TableDeletion[] = [
  // Execution children
  { table: 'loop_executions', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'live_execution_events', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'execution_progress', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'waiting_executions', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'execution_retries', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'dead_letter_queue', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'workflow_execution_sessions', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'workflow_test_sessions', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'scheduled_executions', column: 'user_id', modes: ['full', 'partial'] },

  // Trigger/webhook children
  { table: 'trigger_resources', column: 'user_id', modes: ['full'] },
  { table: 'trigger_state', column: 'workflow_id', byWorkflowIds: true, modes: ['full'] },
  { table: 'trigger_poll_state', column: 'workflow_id', byWorkflowIds: true, modes: ['full'] },
  { table: 'webhook_configs', column: 'workflow_id', byWorkflowIds: true, modes: ['full'] },
  { table: 'webhook_settings', column: 'user_id', modes: ['full'] },
  { table: 'webhook_subscriptions', column: 'user_id', modes: ['full'] },
  { table: 'webhook_queue', column: 'user_id', modes: ['full'] },
  { table: 'google_watch_subscriptions', column: 'workflow_id', byWorkflowIds: true, modes: ['full'] },
  { table: 'microsoft_graph_subscriptions', column: 'workflow_id', byWorkflowIds: true, modes: ['full'] },
  { table: 'airtable_webhooks', column: 'workflow_id', byWorkflowIds: true, modes: ['full'] },

  // AI/Memory
  { table: 'ai_chat_history', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'ai_workflow_cost_logs', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'hitl_memory', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'hitl_conversations', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'user_memory_documents', column: 'user_id', modes: ['full', 'partial'] },

  // Workflow children
  { table: 'workflow_prompts', column: 'user_id', modes: ['full'] },
  { table: 'workflow_nodes', column: 'user_id', modes: ['full'] },
  { table: 'workflow_edges', column: 'user_id', modes: ['full'] },
  { table: 'workflow_files', column: 'workflow_id', byWorkflowIds: true, modes: ['full'] },
  { table: 'workflow_variables', column: 'workflow_id', byWorkflowIds: true, modes: ['full'] },
  { table: 'workflow_preferences', column: 'user_id', modes: ['full'] },

  // Integration children
  { table: 'integration_shares', column: 'shared_by', modes: ['full', 'partial'] },
  { table: 'integration_audit_log', column: 'user_id', modes: ['full'] },

  // Auth/credentials
  { table: 'token_refresh_logs', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'pkce_flow', column: 'user_id', modes: ['full', 'partial'] },

  // Notifications & social
  { table: 'notifications', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'social_post_submissions', column: 'user_id', modes: ['full'] },
  { table: 'discord_invite_roles', column: 'user_id', modes: ['full'] },

  // Sessions & auth
  { table: 'sessions', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'sso_login_attempts', column: 'user_id', modes: ['full'] },

  // Logs
  { table: 'browser_automation_logs', column: 'user_id', modes: ['full'] },
  { table: 'error_reports', column: 'user_id', modes: ['full'] },

  // Templates
  { table: 'template_downloads', column: 'user_id', modes: ['full'] },
  { table: 'template_reviews', column: 'user_id', modes: ['full'] },
  { table: 'template_analytics', column: 'user_id', modes: ['full'] },
]

// Tables deleted in Wave 2 (mid-level parents)
const WAVE_2_DELETIONS: TableDeletion[] = [
  { table: 'workflow_executions', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'workflow_folders', column: 'user_id', modes: ['full'] },
  { table: 'team_activity', column: 'user_id', modes: ['full'] },
  { table: 'team_invitations', column: 'user_id', modes: ['full'] },
  { table: 'team_members', column: 'user_id', modes: ['full'] },
  { table: 'subscriptions', column: 'user_id', modes: ['full'] },
  { table: 'api_keys', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'custom_api_connectors', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'database_connections', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'beta_testers', column: 'user_id', modes: ['full'] },
  { table: 'dynamic_templates', column: 'created_by', modes: ['full'] },
  { table: 'data_deletion_requests', column: 'user_id', modes: ['full'] },
]

// Tables deleted in Wave 3 (high-level parents)
const WAVE_3_DELETIONS: TableDeletion[] = [
  { table: 'integrations', column: 'user_id', modes: ['full', 'partial'] },
  { table: 'workflows', column: 'user_id', modes: ['full'] },
  { table: 'flow_v2_definitions', column: 'owner_id', modes: ['full'] },
]

// Tables deleted in Wave 4 (top-level entities)
const WAVE_4_DELETIONS: TableDeletion[] = [
  { table: 'organization_members', column: 'user_id', modes: ['full'] },
  { table: 'workspace_memberships', column: 'user_id', modes: ['full'] },
  { table: 'teams', column: 'created_by', modes: ['full'] },
  { table: 'organizations', column: 'owner_id', modes: ['full'] },
  { table: 'workspaces', column: 'owner_id', modes: ['full'] },
]

// Tables anonymized in Wave 5 (audit logs - keep for compliance)
const WAVE_5_ANONYMIZATIONS: TableAnonymization[] = [
  {
    table: 'compliance_audit_logs',
    column: 'user_id',
    fields: {
      user_id: null,
      ip_address: null,
      user_agent: 'Anonymized per deletion request',
      old_values: null,
      new_values: null,
    },
    modes: ['full', 'partial', 'anonymize'],
  },
  {
    table: 'audit_logs',
    column: 'user_id',
    fields: {
      user_id: null,
      ip_address: null,
      user_agent: 'Anonymized per deletion request',
    },
    modes: ['full', 'partial', 'anonymize'],
  },
]

// Workflow anonymization for partial/anonymize modes
const WORKFLOW_ANONYMIZATION: TableAnonymization = {
  table: 'workflows',
  column: 'user_id',
  fields: {
    name: 'Anonymized Workflow',
    description: 'Data anonymized per deletion request',
    config: null,
  },
  modes: ['partial', 'anonymize'],
}

// Wave 6: user_profiles deletion
const WAVE_6_DELETIONS: TableDeletion[] = [
  { table: 'user_profiles', column: 'id', modes: ['full'] },
]

export class UserDeletionService {
  private supabase: SupabaseClient

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase = supabaseClient || createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )
  }

  /**
   * Delete all user data according to the specified mode.
   *
   * Modes:
   * - full: Delete everything + delete auth user
   * - partial: Delete sensitive data, anonymize workflows, keep account
   * - anonymize: Anonymize identifiable data, keep structure
   */
  async deleteUser(userId: string, mode: DeletionMode): Promise<DeletionResult> {
    const errors: Array<{ table: string; error: string }> = []
    let tablesProcessed = 0
    let webhookCleanupErrors: string[] = []

    logger.info(`[UserDeletion] Starting ${mode} deletion for user ${userId}`)

    // Fetch user's workflow IDs upfront (needed for workflow_id-based deletions)
    const workflowIds = await this.getUserWorkflowIds(userId)
    logger.debug(`[UserDeletion] Found ${workflowIds.length} workflows for user ${userId}`)

    // Wave 0: Deregister external webhooks before deleting any data
    if (mode === 'full') {
      webhookCleanupErrors = await this.cleanupExternalWebhooks(userId, workflowIds)
    }

    // Wave 1: Deepest children
    const wave1Errors = await this.executeWave(userId, workflowIds, WAVE_1_DELETIONS, mode)
    errors.push(...wave1Errors.errors)
    tablesProcessed += wave1Errors.processed

    // Wave 2: Mid-level parents
    const wave2Errors = await this.executeWave(userId, workflowIds, WAVE_2_DELETIONS, mode)
    errors.push(...wave2Errors.errors)
    tablesProcessed += wave2Errors.processed

    // Wave 3: High-level parents (+ workflow anonymization for partial/anonymize)
    if (mode === 'partial' || mode === 'anonymize') {
      const anonError = await this.anonymizeTable(
        WORKFLOW_ANONYMIZATION.table,
        WORKFLOW_ANONYMIZATION.column,
        userId,
        WORKFLOW_ANONYMIZATION.fields
      )
      if (anonError) errors.push(anonError)
      tablesProcessed++
    }
    const wave3Errors = await this.executeWave(userId, workflowIds, WAVE_3_DELETIONS, mode)
    errors.push(...wave3Errors.errors)
    tablesProcessed += wave3Errors.processed

    // Wave 4: Top-level entities
    const wave4Errors = await this.executeWave(userId, workflowIds, WAVE_4_DELETIONS, mode)
    errors.push(...wave4Errors.errors)
    tablesProcessed += wave4Errors.processed

    // Wave 5: Anonymize audit logs
    const wave5Errors = await this.executeAnonymizationWave(userId, WAVE_5_ANONYMIZATIONS, mode)
    errors.push(...wave5Errors.errors)
    tablesProcessed += wave5Errors.processed

    // Wave 6: User profile
    if (mode === 'full') {
      const wave6Errors = await this.executeWave(userId, workflowIds, WAVE_6_DELETIONS, mode)
      errors.push(...wave6Errors.errors)
      tablesProcessed += wave6Errors.processed
    }

    // Wave 7: Delete auth user (full mode only)
    if (mode === 'full') {
      try {
        const { error: authError } = await this.supabase.auth.admin.deleteUser(userId)
        if (authError) {
          errors.push({ table: 'auth.users', error: authError.message })
          logger.error(`[UserDeletion] Failed to delete auth user: ${authError.message}`)
        } else {
          tablesProcessed++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        errors.push({ table: 'auth.users', error: msg })
        logger.error(`[UserDeletion] Failed to delete auth user: ${msg}`)
      }
    }

    const success = errors.length === 0
    logger.info(
      `[UserDeletion] ${mode} deletion ${success ? 'completed' : 'completed with errors'} for user ${userId}. ` +
      `Tables processed: ${tablesProcessed}, Errors: ${errors.length}`
    )

    return { success, tablesProcessed, errors, webhookCleanupErrors }
  }

  /**
   * Deregister external webhooks for all user's workflows
   */
  private async cleanupExternalWebhooks(userId: string, workflowIds: string[]): Promise<string[]> {
    const allErrors: string[] = []

    for (const workflowId of workflowIds) {
      try {
        const result = await triggerLifecycleManager.deleteWorkflowTriggers(workflowId, userId)
        if (!result.success) {
          allErrors.push(...result.errors)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        allErrors.push(`Webhook cleanup failed for workflow ${workflowId}: ${msg}`)
        logger.error(`[UserDeletion] Webhook cleanup failed for workflow ${workflowId}: ${msg}`)
      }
    }

    if (allErrors.length > 0) {
      logger.warn(`[UserDeletion] ${allErrors.length} webhook cleanup errors (continuing with deletion)`)
    }

    return allErrors
  }

  /**
   * Get all workflow IDs belonging to a user
   */
  private async getUserWorkflowIds(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('workflows')
      .select('id')
      .eq('user_id', userId)

    if (error) {
      logger.error(`[UserDeletion] Failed to fetch workflow IDs: ${error.message}`)
      return []
    }

    return (data || []).map(w => w.id)
  }

  /**
   * Execute a wave of deletions in parallel
   */
  private async executeWave(
    userId: string,
    workflowIds: string[],
    tables: TableDeletion[],
    mode: DeletionMode
  ): Promise<{ errors: Array<{ table: string; error: string }>; processed: number }> {
    const errors: Array<{ table: string; error: string }> = []
    const applicableTables = tables.filter(t => t.modes.includes(mode))

    if (applicableTables.length === 0) {
      return { errors: [], processed: 0 }
    }

    const results = await Promise.all(
      applicableTables.map(async (t) => {
        try {
          if (t.byWorkflowIds) {
            if (workflowIds.length > 0) {
              await this.deleteByWorkflowIds(t.table, t.column, workflowIds)
            }
          } else {
            await this.deleteFromTable(t.table, t.column, userId)
          }
          return null
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          logger.error(`[UserDeletion] Error deleting from ${t.table}: ${msg}`)
          return { table: t.table, error: msg }
        }
      })
    )

    for (const r of results) {
      if (r) errors.push(r)
    }

    return { errors, processed: applicableTables.length }
  }

  /**
   * Execute a wave of anonymizations in parallel
   */
  private async executeAnonymizationWave(
    userId: string,
    tables: TableAnonymization[],
    mode: DeletionMode
  ): Promise<{ errors: Array<{ table: string; error: string }>; processed: number }> {
    const errors: Array<{ table: string; error: string }> = []
    const applicableTables = tables.filter(t => t.modes.includes(mode))

    if (applicableTables.length === 0) {
      return { errors: [], processed: 0 }
    }

    const results = await Promise.all(
      applicableTables.map(t => this.anonymizeTable(t.table, t.column, userId, t.fields))
    )

    for (const r of results) {
      if (r) errors.push(r)
    }

    return { errors, processed: applicableTables.length }
  }

  /**
   * Delete all rows from a table matching a user column
   */
  private async deleteFromTable(table: string, column: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from(table)
      .delete()
      .eq(column, userId)

    if (error) {
      // Some tables may not exist in all environments - log and continue
      logger.debug(`[UserDeletion] Delete from ${table} (${column}=${userId}): ${error.message}`)
      throw error
    }
  }

  /**
   * Delete all rows from a table matching workflow IDs
   */
  private async deleteByWorkflowIds(table: string, column: string, workflowIds: string[]): Promise<void> {
    const { error } = await this.supabase
      .from(table)
      .delete()
      .in(column, workflowIds)

    if (error) {
      logger.debug(`[UserDeletion] Delete from ${table} by ${column}: ${error.message}`)
      throw error
    }
  }

  /**
   * Anonymize rows in a table instead of deleting
   */
  private async anonymizeTable(
    table: string,
    column: string,
    userId: string,
    fields: Record<string, any>
  ): Promise<{ table: string; error: string } | null> {
    try {
      const { error } = await this.supabase
        .from(table)
        .update(fields)
        .eq(column, userId)

      if (error) {
        logger.debug(`[UserDeletion] Anonymize ${table}: ${error.message}`)
        return { table, error: error.message }
      }
      return null
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      logger.error(`[UserDeletion] Anonymize ${table} failed: ${msg}`)
      return { table, error: msg }
    }
  }
}
