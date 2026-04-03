import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { logAdminAction } from '@/lib/utils/admin-audit'
import { logger } from '@/lib/utils/logger'

/**
 * Action-scoped admin helpers for beta tester operations.
 * All service-role DB access is contained here — route files should
 * never create or receive a service client directly.
 */

export interface AddBetaTesterParams {
  email: string
  notes?: string | null
  expires_at?: string | null
  max_workflows?: number
  max_executions_per_month?: number
  max_integrations?: number
  added_by: string
}

export async function addBetaTester(adminUserId: string, params: AddBetaTesterParams, request?: Request) {
  const supabase = await createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('beta_testers')
    .insert({
      email: params.email.toLowerCase().trim(),
      notes: params.notes?.trim() || null,
      expires_at: params.expires_at || null,
      max_workflows: params.max_workflows || 50,
      max_executions_per_month: params.max_executions_per_month || 5000,
      max_integrations: params.max_integrations || 30,
      added_by: params.added_by,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (!error) {
    await logAdminAction({
      userId: adminUserId,
      action: 'beta_tester_add',
      resourceType: 'beta_testers',
      resourceId: data?.id,
      newValues: { email: params.email },
      request,
    })
  }

  return { data, error }
}

export async function deleteBetaTester(adminUserId: string, testerId: string, request?: Request) {
  const supabase = await createSupabaseServiceClient()

  // Fetch for audit log before deleting
  const { data: tester, error: fetchError } = await supabase
    .from('beta_testers')
    .select('email')
    .eq('id', testerId)
    .single()

  if (fetchError || !tester) {
    return { data: null, error: fetchError || { message: 'Beta tester not found' } }
  }

  const { error } = await supabase
    .from('beta_testers')
    .delete()
    .eq('id', testerId)

  if (!error) {
    await logAdminAction({
      userId: adminUserId,
      action: 'beta_tester_delete',
      resourceType: 'beta_testers',
      resourceId: testerId,
      oldValues: { email: tester.email },
      request,
    })
  }

  return { data: tester, error }
}

export async function listBetaTesters() {
  const supabase = await createSupabaseServiceClient()
  return supabase
    .from('beta_testers')
    .select('*')
    .order('created_at', { ascending: false })
}

export interface UpdateBetaTesterParams {
  status?: string
  notes?: string
  max_workflows?: number
  max_executions_per_month?: number
  expires_at?: string | null
}

export async function updateBetaTester(
  adminUserId: string,
  testerId: string,
  params: UpdateBetaTesterParams,
  request?: Request
) {
  const supabase = await createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('beta_testers')
    .update({
      ...params,
      updated_at: new Date().toISOString(),
    })
    .eq('id', testerId)
    .select()
    .single()

  if (!error) {
    await logAdminAction({
      userId: adminUserId,
      action: 'beta_tester_update',
      resourceType: 'beta_testers',
      resourceId: testerId,
      newValues: params,
      request,
    })
  }

  return { data, error }
}
