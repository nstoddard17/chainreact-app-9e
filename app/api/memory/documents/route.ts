/**
 * ChainReact Memory Documents API
 * Manages user's AI memory and knowledge base documents stored in Supabase
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

/**
 * GET /api/memory/documents
 * List all memory documents for the authenticated user
 * Query params:
 *   - type: 'memory' | 'knowledge_base' (filter by doc type)
 *   - workflowId: UUID (filter by workflow)
 *   - scope: 'user' | 'workflow' | 'global' (filter by scope)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const docType = searchParams.get('type')
    const workflowId = searchParams.get('workflowId')
    const scope = searchParams.get('scope')

    // Build query
    let query = supabase
      .from('user_memory_documents')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    // Apply filters
    if (docType) {
      query = query.eq('doc_type', docType)
    }
    if (workflowId) {
      query = query.eq('workflow_id', workflowId)
    }
    if (scope) {
      query = query.eq('scope', scope)
    }

    const { data: documents, error } = await query

    if (error) {
      logger.error('[Memory API] Error fetching documents', { error, userId: user.id })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      documents: documents || [],
      count: documents?.length || 0
    })

  } catch (error: any) {
    logger.error('[Memory API] GET error', { error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/memory/documents
 * Create a new memory document
 * Body:
 *   - docType: 'memory' | 'knowledge_base'
 *   - title: string
 *   - description?: string
 *   - content?: string
 *   - structuredData?: object
 *   - workflowId?: UUID
 *   - scope?: 'user' | 'workflow'
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const {
      docType,
      title,
      description,
      content,
      structuredData,
      workflowId,
      scope = 'user'
    } = body

    // Validation
    if (!docType || !['memory', 'knowledge_base'].includes(docType)) {
      return NextResponse.json(
        { error: 'Invalid or missing docType' },
        { status: 400 }
      )
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      )
    }

    // Check for existing document (upsert behavior)
    const { data: existing } = await supabase
      .from('user_memory_documents')
      .select('id')
      .eq('user_id', user.id)
      .eq('doc_type', docType)
      .eq('workflow_id', workflowId || null)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        {
          error: 'Document already exists for this user/workflow/type combination',
          existingId: existing.id
        },
        { status: 409 }
      )
    }

    // Create document
    const { data: document, error } = await supabase
      .from('user_memory_documents')
      .insert({
        user_id: user.id,
        workflow_id: workflowId || null,
        doc_type: docType,
        title: title.trim(),
        description: description?.trim() || null,
        content: content || '',
        structured_data: structuredData || {},
        scope,
        last_accessed_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      logger.error('[Memory API] Error creating document', {
        error,
        userId: user.id,
        docType
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logger.info('[Memory API] Document created', {
      documentId: document.id,
      userId: user.id,
      docType
    })

    return NextResponse.json({ document }, { status: 201 })

  } catch (error: any) {
    logger.error('[Memory API] POST error', { error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
