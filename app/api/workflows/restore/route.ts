import { randomUUID } from 'crypto'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { errorResponse, successResponse } from '@/lib/utils/api-response'

// Only include columns that exist in the actual database schema
const ALLOWED_WORKFLOW_KEYS = new Set([
  'id',
  'name',
  'description',
  'user_id',
  'organization_id',
  'folder_id',
  'nodes',
  'connections',
  'status',
  'source_template_id',
  'created_at',
  'updated_at',
  'executions_count',
  'created_by',
])

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { workflow } = await request.json()

    if (!workflow || typeof workflow !== 'object') {
      return errorResponse('Invalid workflow payload', 400)
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Not authenticated', 401)
    }

    const filteredEntries = Object.entries(workflow).filter(([key]) => ALLOWED_WORKFLOW_KEYS.has(key))
    const restorePayload: Record<string, any> = Object.fromEntries(filteredEntries)

    if (!restorePayload.id) {
      restorePayload.id = randomUUID()
    }

    restorePayload.user_id = user.id
    restorePayload.status = restorePayload.status ?? 'draft'
    restorePayload.created_at = restorePayload.created_at ?? new Date().toISOString()
    restorePayload.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('workflows')
      .upsert(restorePayload, { onConflict: 'id' })
      .select('*')
      .single()

    if (error) {
      return errorResponse(error.message, 500)
    }

    return successResponse({ workflow: data })
  } catch (error: any) {
    return errorResponse(error?.message || 'Failed to restore workflow', 500)
  }
}
