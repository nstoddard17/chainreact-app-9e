import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

/**
 * Batch operations endpoint for workflows
 * Supports: delete, move, update operations on multiple workflows at once
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { operation, workflowIds, data } = body

    if (!operation || !Array.isArray(workflowIds) || workflowIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid request: operation and workflowIds are required' },
        { status: 400 }
      )
    }

    logger.info(`Batch ${operation} operation for ${workflowIds.length} workflows`, {
      operation,
      workflowCount: workflowIds.length,
      userId: user.id
    })

    let result: any = { success: true, processed: 0, failed: 0, errors: [] }

    switch (operation) {
      case 'delete':
        result = await batchDelete(supabase, user.id, workflowIds)
        break

      case 'move':
        if (!data?.folder_id) {
          return NextResponse.json(
            { success: false, error: 'folder_id is required for move operation' },
            { status: 400 }
          )
        }
        result = await batchMove(supabase, user.id, workflowIds, data.folder_id)
        break

      case 'trash':
        result = await batchMoveToTrash(supabase, user.id, workflowIds)
        break

      case 'restore':
        result = await batchRestore(supabase, user.id, workflowIds)
        break

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported operation: ${operation}` },
          { status: 400 }
        )
    }

    logger.info(`Batch ${operation} completed`, {
      processed: result.processed,
      failed: result.failed
    })

    return NextResponse.json(result)
  } catch (error: any) {
    logger.error('Batch operation error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Batch delete workflows (permanent deletion)
 */
async function batchDelete(supabase: any, userId: string, workflowIds: string[]) {
  const result = { success: true, processed: 0, failed: 0, errors: [] as any[] }

  try {
    // Verify ownership for all workflows first
    const { data: workflows, error: fetchError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .in('id', workflowIds)

    if (fetchError) throw fetchError

    // Filter to only workflows owned by the user
    const ownedIds = workflows
      .filter((w: any) => w.user_id === userId)
      .map((w: any) => w.id)

    if (ownedIds.length === 0) {
      return { success: false, error: 'No workflows found or you do not have permission to delete them' }
    }

    // Delete all workflows in a single query
    const { error: deleteError } = await supabase
      .from('workflows')
      .delete()
      .in('id', ownedIds)

    if (deleteError) throw deleteError

    result.processed = ownedIds.length
    result.failed = workflowIds.length - ownedIds.length

    if (result.failed > 0) {
      result.errors.push({
        message: `${result.failed} workflow(s) were not deleted (permission denied or not found)`
      })
    }

    return result
  } catch (error: any) {
    logger.error('Batch delete error:', error)
    return {
      success: false,
      processed: 0,
      failed: workflowIds.length,
      error: error.message || 'Failed to delete workflows'
    }
  }
}

/**
 * Batch move workflows to a folder
 */
async function batchMove(supabase: any, userId: string, workflowIds: string[], folderId: string) {
  const result = { success: true, processed: 0, failed: 0, errors: [] as any[] }

  try {
    // Verify ownership for all workflows first
    const { data: workflows, error: fetchError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .in('id', workflowIds)

    if (fetchError) throw fetchError

    // Filter to only workflows owned by the user
    const ownedIds = workflows
      .filter((w: any) => w.user_id === userId)
      .map((w: any) => w.id)

    if (ownedIds.length === 0) {
      return { success: false, error: 'No workflows found or you do not have permission to move them' }
    }

    // Update all workflows in a single query
    const { error: updateError } = await supabase
      .from('workflows')
      .update({ folder_id: folderId })
      .in('id', ownedIds)

    if (updateError) throw updateError

    result.processed = ownedIds.length
    result.failed = workflowIds.length - ownedIds.length

    if (result.failed > 0) {
      result.errors.push({
        message: `${result.failed} workflow(s) were not moved (permission denied or not found)`
      })
    }

    return result
  } catch (error: any) {
    logger.error('Batch move error:', error)
    return {
      success: false,
      processed: 0,
      failed: workflowIds.length,
      error: error.message || 'Failed to move workflows'
    }
  }
}

/**
 * Batch move workflows to trash (soft delete)
 */
async function batchMoveToTrash(supabase: any, userId: string, workflowIds: string[]) {
  const result = { success: true, processed: 0, failed: 0, errors: [] as any[] }

  try {
    // Verify ownership for all workflows first
    const { data: workflows, error: fetchError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .in('id', workflowIds)

    if (fetchError) throw fetchError

    // Filter to only workflows owned by the user
    const ownedIds = workflows
      .filter((w: any) => w.user_id === userId)
      .map((w: any) => w.id)

    if (ownedIds.length === 0) {
      return { success: false, error: 'No workflows found or you do not have permission to trash them' }
    }

    // Update all workflows in a single query
    const { error: updateError } = await supabase
      .from('workflows')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ownedIds)

    if (updateError) throw updateError

    result.processed = ownedIds.length
    result.failed = workflowIds.length - ownedIds.length

    if (result.failed > 0) {
      result.errors.push({
        message: `${result.failed} workflow(s) were not moved to trash (permission denied or not found)`
      })
    }

    return result
  } catch (error: any) {
    logger.error('Batch move to trash error:', error)
    return {
      success: false,
      processed: 0,
      failed: workflowIds.length,
      error: error.message || 'Failed to move workflows to trash'
    }
  }
}

/**
 * Batch restore workflows from trash
 */
async function batchRestore(supabase: any, userId: string, workflowIds: string[]) {
  const result = { success: true, processed: 0, failed: 0, errors: [] as any[] }

  try {
    // Verify ownership for all workflows first
    const { data: workflows, error: fetchError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .in('id', workflowIds)

    if (fetchError) throw fetchError

    // Filter to only workflows owned by the user
    const ownedIds = workflows
      .filter((w: any) => w.user_id === userId)
      .map((w: any) => w.id)

    if (ownedIds.length === 0) {
      return { success: false, error: 'No workflows found or you do not have permission to restore them' }
    }

    // Update all workflows in a single query
    const { error: updateError } = await supabase
      .from('workflows')
      .update({ deleted_at: null })
      .in('id', ownedIds)

    if (updateError) throw updateError

    result.processed = ownedIds.length
    result.failed = workflowIds.length - ownedIds.length

    if (result.failed > 0) {
      result.errors.push({
        message: `${result.failed} workflow(s) were not restored (permission denied or not found)`
      })
    }

    return result
  } catch (error: any) {
    logger.error('Batch restore error:', error)
    return {
      success: false,
      processed: 0,
      failed: workflowIds.length,
      error: error.message || 'Failed to restore workflows'
    }
  }
}
