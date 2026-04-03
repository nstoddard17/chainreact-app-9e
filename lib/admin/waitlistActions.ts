import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { logAdminAction } from '@/lib/utils/admin-audit'

/**
 * Action-scoped admin helpers for waitlist operations.
 * All service-role DB access is contained here.
 */

export async function listWaitlist() {
  const supabase = await createSupabaseServiceClient()
  return supabase
    .from('waitlist')
    .select('*')
    .order('created_at', { ascending: false })
}

export async function deleteWaitlistEntry(adminUserId: string, entryId: string, request?: Request) {
  const supabase = await createSupabaseServiceClient()

  const { data: entry, error: fetchError } = await supabase
    .from('waitlist')
    .select('email, name')
    .eq('id', entryId)
    .single()

  if (fetchError || !entry) {
    return { data: null, error: fetchError || { message: 'Waitlist entry not found' } }
  }

  const { error } = await supabase
    .from('waitlist')
    .delete()
    .eq('id', entryId)

  if (!error) {
    await logAdminAction({
      userId: adminUserId,
      action: 'waitlist_delete',
      resourceType: 'waitlist',
      resourceId: entryId,
      oldValues: { email: entry.email, name: entry.name },
      request,
    })
  }

  return { data: entry, error }
}

export interface UpdateWaitlistParams {
  name?: string
  email?: string
  status?: string
  selected_integrations?: string[]
  custom_integrations?: string
  wants_ai_assistant?: boolean
  wants_ai_actions?: boolean
  ai_actions_importance?: string
}

export async function updateWaitlistEntry(
  adminUserId: string,
  entryId: string,
  params: UpdateWaitlistParams,
  request?: Request
) {
  const supabase = await createSupabaseServiceClient()

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) updateData[key] = value
  }

  const { data, error } = await supabase
    .from('waitlist')
    .update(updateData)
    .eq('id', entryId)
    .select()
    .single()

  if (!error) {
    await logAdminAction({
      userId: adminUserId,
      action: 'waitlist_update',
      resourceType: 'waitlist',
      resourceId: entryId,
      newValues: params,
      request,
    })
  }

  return { data, error }
}

/**
 * Get waitlist members eligible for invitation (used by send-invite route).
 * Returns service client for the route to perform additional operations
 * (token generation, email sending, status updates).
 */
export async function getWaitlistForInvitation(memberIds?: string[], sendToAll?: boolean) {
  const supabase = await createSupabaseServiceClient()

  let query = supabase.from('waitlist').select('*')

  if (sendToAll) {
    query = query.eq('status', 'pending').is('invitation_sent_at', null)
  } else if (memberIds && memberIds.length > 0) {
    query = query.in('id', memberIds)
  } else {
    return { data: null, error: { message: 'No members specified' }, supabase: null }
  }

  const { data, error } = await query
  // Return the scoped client for the invite flow to update tokens
  return { data, error, supabase }
}
