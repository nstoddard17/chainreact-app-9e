import type { BillingScopeType } from './types'

/**
 * Centralized helper for deriving canonical billing scope fields
 * from product context. Used by all workflow write paths (create, update, clone).
 *
 * NOT used by execution sessions — those copy scope from resolveBillingScope(workflow).
 */
export function buildWorkflowScopeFields(context: {
  workspaceType?: string | null
  workspaceId?: string | null
  userId: string
}): { billing_scope_type: BillingScopeType; billing_scope_id: string } {
  if (context.workspaceType === 'team' && context.workspaceId) {
    return { billing_scope_type: 'team', billing_scope_id: context.workspaceId }
  }
  if (context.workspaceType === 'organization' && context.workspaceId) {
    return { billing_scope_type: 'organization', billing_scope_id: context.workspaceId }
  }
  return { billing_scope_type: 'user', billing_scope_id: context.userId }
}
