/**
 * Trigger Lifecycle Types
 *
 * Defines the standard interface that ALL triggers must implement
 * for proper resource management during workflow activation/deactivation.
 */

export interface TriggerConfig {
  [key: string]: any
}

export interface TriggerActivationContext {
  workflowId: string
  userId: string
  nodeId: string
  triggerType: string
  providerId: string
  config: TriggerConfig
  webhookUrl?: string
  /**
   * Test mode configuration - when set, creates a test subscription
   * that uses a separate webhook URL and won't trigger production workflows
   */
  testMode?: {
    isTest: true
    testSessionId: string
  }
}

export interface TriggerDeactivationContext {
  workflowId: string
  userId: string
  providerId: string
  /**
   * When set, only deactivate test subscriptions for this session
   */
  testSessionId?: string
}

export interface TriggerHealthStatus {
  healthy: boolean
  details?: string
  expiresAt?: string
  lastChecked: string
}

/**
 * TriggerLifecycle Interface
 *
 * ALL trigger providers must implement this interface to ensure
 * consistent resource management across the platform.
 */
export interface TriggerLifecycle {
  /**
   * Called when a workflow containing this trigger is activated.
   * Should create all necessary resources (webhooks, subscriptions, etc.)
   *
   * @param context - Activation context with workflow and trigger details
   * @returns Promise that resolves when resources are created
   */
  onActivate(context: TriggerActivationContext): Promise<void>

  /**
   * Called when a workflow containing this trigger is deactivated.
   * Should clean up ALL resources created during activation.
   *
   * @param context - Deactivation context with workflow details
   * @returns Promise that resolves when resources are cleaned up
   */
  onDeactivate(context: TriggerDeactivationContext): Promise<void>

  /**
   * Called when a workflow is deleted.
   * Should ensure complete cleanup of all resources.
   *
   * @param context - Deactivation context with workflow details
   * @returns Promise that resolves when resources are cleaned up
   */
  onDelete(context: TriggerDeactivationContext): Promise<void>

  /**
   * Checks the health of the trigger resources.
   * Used for monitoring and auto-renewal.
   *
   * @param workflowId - The workflow ID to check
   * @param userId - The user ID
   * @returns Promise with health status
   */
  checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus>
}

/**
 * Registry entry for a trigger provider
 */
export interface TriggerProviderEntry {
  providerId: string
  lifecycle: TriggerLifecycle
  requiresExternalResources: boolean
  description: string
}

/**
 * Resource tracking for audit and cleanup
 */
export interface TriggerResource {
  id: string
  workflowId: string
  userId: string
  providerId: string
  resourceType: 'webhook' | 'subscription' | 'polling' | 'other'
  externalId?: string // ID in the external system (e.g., Microsoft Graph subscription ID)
  config: TriggerConfig
  status: 'active' | 'expired' | 'deleted' | 'error'
  createdAt: string
  expiresAt?: string
  lastHealthCheck?: string
}
