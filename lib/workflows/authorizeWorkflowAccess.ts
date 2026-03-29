import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { resolveBillingScope } from '@/lib/billing/resolveBillingScope'
import type { BillingScope } from '@/lib/billing/types'

// ============================================================
// Workflow Authorization — Action-based, matrix-driven
// ============================================================
// Callers pass an action. They never interpret raw role strings.
// The authorization matrix below is the single source of truth.

export type WorkflowAction = 'view' | 'edit' | 'execute' | 'manage'

export interface AuthorizationResult {
  allowed: boolean
  scope: BillingScope
  response?: NextResponse
}

// ============================================================
// Authorization Matrix
// ============================================================

// Personal workflow permissions
const PERSONAL_SHARED_ACTIONS: Set<WorkflowAction> = new Set(['view', 'execute'])

// Team workflow matrix: role -> allowed actions
const TEAM_ACTION_MATRIX: Record<string, Set<WorkflowAction>> = {
  owner:   new Set(['view', 'edit', 'execute', 'manage']),
  admin:   new Set(['view', 'edit', 'execute', 'manage']),
  manager: new Set(['view', 'edit', 'execute']),
  lead:    new Set(['view', 'edit', 'execute']),
  member:  new Set(['view', 'execute']),
  guest:   new Set(['view']),
}

// Organization workflow matrix: role -> allowed actions
const ORG_ACTION_MATRIX: Record<string, Set<WorkflowAction>> = {
  owner:   new Set(['view', 'edit', 'execute', 'manage']),
  admin:   new Set(['view', 'edit', 'execute', 'manage']),
  manager: new Set(['view', 'edit', 'execute']),
  hr:      new Set(['view']),
  finance: new Set(['view']),
}

// ============================================================
// Core Authorization Function
// ============================================================

export async function authorizeWorkflowAccess(
  userId: string,
  workflow: {
    user_id: string | null
    billing_scope_type: string
    billing_scope_id: string
  },
  action: WorkflowAction
): Promise<AuthorizationResult> {
  const scope = resolveBillingScope(workflow)
  const supabase = createAdminClient()

  // --- User scope: owner or shared access ---
  if (scope.scopeType === 'user') {
    if (workflow.user_id === userId) {
      logAuthDecision(userId, action, scope, 'owner', true)
      return { allowed: true, scope }
    }

    // Check shared access via workflow_shares
    if (action === 'view' || action === 'execute') {
      const { data: shareRecord } = await supabase
        .from('workflow_shares')
        .select('id')
        .eq('workflow_id', scope.scopeId)
        .eq('shared_with', userId)
        .maybeSingle()

      if (shareRecord) {
        if (PERSONAL_SHARED_ACTIONS.has(action)) {
          logAuthDecision(userId, action, scope, 'shared', true)
          return { allowed: true, scope }
        }
      }
    }

    logAuthDecision(userId, action, scope, 'none', false)
    return denied(scope)
  }

  // --- Team scope: check team_members role ---
  if (scope.scopeType === 'team') {
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', scope.scopeId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!teamMember) {
      logAuthDecision(userId, action, scope, 'not_member', false)
      return denied(scope)
    }

    const role = teamMember.role ?? 'member'
    const allowedActions = TEAM_ACTION_MATRIX[role]
    if (allowedActions?.has(action)) {
      logAuthDecision(userId, action, scope, role, true)
      return { allowed: true, scope }
    }

    logAuthDecision(userId, action, scope, role, false)
    return denied(scope)
  }

  // --- Organization scope: check organization_members role ---
  if (scope.scopeType === 'organization') {
    const { data: orgMember } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', scope.scopeId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!orgMember) {
      logAuthDecision(userId, action, scope, 'not_member', false)
      return denied(scope)
    }

    const role = orgMember.role ?? 'member'
    const allowedActions = ORG_ACTION_MATRIX[role]
    if (allowedActions?.has(action)) {
      logAuthDecision(userId, action, scope, role, true)
      return { allowed: true, scope }
    }

    logAuthDecision(userId, action, scope, role, false)
    return denied(scope)
  }

  // Unknown scope type — deny
  logger.error('[authorizeWorkflowAccess] Unknown scope type', { scopeType: scope.scopeType })
  return denied(scope)
}

// ============================================================
// resolveWorkflowScope — pure function, reads billing_scope_* only
// ============================================================

export function resolveWorkflowScope(workflow: {
  billing_scope_type: string
  billing_scope_id: string
}): BillingScope {
  return resolveBillingScope(workflow)
}

// ============================================================
// Helpers
// ============================================================

function denied(scope: BillingScope): AuthorizationResult {
  return {
    allowed: false,
    scope,
    response: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
  }
}

function logAuthDecision(
  userId: string,
  action: WorkflowAction,
  scope: BillingScope,
  resolvedRole: string,
  allowed: boolean
) {
  const counter = allowed ? 'workflow.auth.allow' : 'workflow.auth.deny'
  logger.info(`[${counter}]`, {
    userId,
    action,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    resolvedRole,
    allowed,
  })
}
