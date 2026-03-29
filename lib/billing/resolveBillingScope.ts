import type { BillingScope, BillingScopeType } from './types'

/**
 * Pure read from canonical billing scope columns. No fallback.
 *
 * billing_scope_type + billing_scope_id are the ONLY ownership source.
 * workspace_* and workflow.user_id are never consulted.
 */
export function resolveBillingScope(workflow: {
  billing_scope_type: string
  billing_scope_id: string
}): BillingScope {
  return {
    scopeType: workflow.billing_scope_type as BillingScopeType,
    scopeId: workflow.billing_scope_id,
  }
}
