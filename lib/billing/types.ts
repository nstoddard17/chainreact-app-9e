/**
 * Canonical billing scope types.
 *
 * billing_scope_type + billing_scope_id are the ONLY ownership source
 * for billing, authorization, and entitlement decisions.
 */

export type BillingScopeType = 'user' | 'team' | 'organization'

export interface BillingScope {
  scopeType: BillingScopeType
  scopeId: string
}
