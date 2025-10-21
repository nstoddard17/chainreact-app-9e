/**
 * ChainReact Memory Document API (Individual Document Operations)
 * GET, UPDATE, DELETE specific memory documents
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

/**
 * GET /api/memory/documents/:id
 * Get a specific memory document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id

    // Fetch document (RLS ensures user can only see their own)
    const { data: document, error } = await supabase
      .from('user_memory_documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      logger.error('[Memory API] Error fetching document', {
        error,
        documentId,
        userId: user.id
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update last accessed time
    await supabase
      .from('user_memory_documents')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', documentId)

    return NextResponse.json({ document })

  } catch (error: any) {
    logger.error('[Memory API] GET (single) error', { error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/memory/documents/:id
 * Update a memory document
 * Body (all optional):
 *   - title?: string
 *   - description?: string
 *   - content?: string
 *   - structuredData?: object
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id

    // Parse request body
    const body = await request.json()
    const { title, description, content, structuredData } = body

    // Build update object (only include provided fields)
    const updates: any = {}
    if (title !== undefined) updates.title = title.trim()
    if (description !== undefined) updates.description = description?.trim() || null
    if (content !== undefined) updates.content = content
    if (structuredData !== undefined) updates.structured_data = structuredData
    updates.last_accessed_at = new Date().toISOString()

    if (Object.keys(updates).length === 1) {
      // Only last_accessed_at, nothing to update
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    // Update document (RLS ensures user can only update their own)
    const { data: document, error } = await supabase
      .from('user_memory_documents')
      .update(updates)
      .eq('id', documentId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      logger.error('[Memory API] Error updating document', {
        error,
        documentId,
        userId: user.id
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logger.info('[Memory API] Document updated', {
      documentId,
      userId: user.id,
      fieldsUpdated: Object.keys(updates)
    })

    return NextResponse.json({ document })

  } catch (error: any) {
    logger.error('[Memory API] PATCH error', { error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/memory/documents/:id
 * Delete a memory document
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id

    // Delete document (RLS ensures user can only delete their own)
    const { error } = await supabase
      .from('user_memory_documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', user.id)

    if (error) {
      logger.error('[Memory API] Error deleting document', {
        error,
        documentId,
        userId: user.id
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logger.info('[Memory API] Document deleted', {
      documentId,
      userId: user.id
    })

    return NextResponse.json({ success: true, message: 'Document deleted' })

  } catch (error: any) {
    logger.error('[Memory API] DELETE error', { error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
