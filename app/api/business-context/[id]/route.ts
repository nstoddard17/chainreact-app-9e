import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/business-context/[id]
 * Update a business context entry.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()

    // Reject unknown fields to prevent API surface drift
    const ALLOWED_FIELDS = new Set(['value', 'category', 'locked', 'relevance_tags'])
    const unknownFields = Object.keys(body).filter(k => !ALLOWED_FIELDS.has(k))
    if (unknownFields.length > 0) {
      return errorResponse(`Unknown fields: ${unknownFields.join(', ')}`, 400)
    }

    const updates: Record<string, unknown> = {}
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse('No valid fields to update', 400)
    }

    // Cast: business_context table not yet in generated Supabase types
    const { data, error } = await (supabase as any)
      .from('business_context')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('Entry not found', 404)
      }
      logger.error('Failed to update business context entry', { error, id, userId: user.id })
      return errorResponse('Failed to update entry', 500)
    }

    return jsonResponse({ entry: data })
  } catch (error) {
    logger.error('Business context PATCH error', { error })
    return errorResponse('Internal server error', 500)
  }
}

/**
 * DELETE /api/business-context/[id]
 * Delete a business context entry.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const { error } = await (supabase as any)
      .from('business_context')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      logger.error('Failed to delete business context entry', { error, id, userId: user.id })
      return errorResponse('Failed to delete entry', 500)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    logger.error('Business context DELETE error', { error })
    return errorResponse('Internal server error', 500)
  }
}
