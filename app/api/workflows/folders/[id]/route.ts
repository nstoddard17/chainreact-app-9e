import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

// PUT /api/workflows/folders/[id] - Update folder
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, color, icon } = body

    // Verify folder belongs to user
    const { data: existingFolder, error: fetchError } = await supabase
      .from('workflow_folders')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existingFolder) {
      return NextResponse.json(
        { success: false, error: 'Folder not found' },
        { status: 404 }
      )
    }

    const { data: folder, error } = await supabase
      .from('workflow_folders')
      .update({
        name: name?.trim() || existingFolder.name,
        description: description !== undefined ? description : existingFolder.description,
        color: color || existingFolder.color,
        icon: icon || existingFolder.icon,
      })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, folder })
  } catch (error: any) {
    console.error('Error updating folder:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update folder' },
      { status: 500 }
    )
  }
}

// DELETE /api/workflows/folders/[id] - Delete folder
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body for action and targetFolderId
    let action: 'delete' | 'move' | null = null
    let targetFolderId: string | null = null

    try {
      const body = await request.json()
      action = body.action || null
      targetFolderId = body.targetFolderId || null
    } catch {
      // No body - legacy behavior (move to default folder)
    }

    // Verify folder belongs to user
    const { data: existingFolder, error: fetchError } = await supabase
      .from('workflow_folders')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existingFolder) {
      return NextResponse.json(
        { success: false, error: 'Folder not found' },
        { status: 404 }
      )
    }

    // Prevent deletion of default folder
    if (existingFolder.is_default === true) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete default folder' },
        { status: 403 }
      )
    }

    // Prevent deletion of trash folder
    if (existingFolder.is_trash === true) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete trash folder' },
        { status: 403 }
      )
    }

    // Handle workflows in the folder based on action
    if (action === 'delete') {
      // Delete all workflows in the folder
      const { error: deleteWorkflowsError } = await supabase
        .from('workflows')
        .delete()
        .eq('folder_id', params.id)
        .eq('user_id', user.id)

      if (deleteWorkflowsError) {
        throw new Error(`Failed to delete workflows: ${deleteWorkflowsError.message}`)
      }
    } else if (action === 'move' && targetFolderId) {
      // Verify target folder exists and belongs to user
      const { data: targetFolder, error: targetError } = await supabase
        .from('workflow_folders')
        .select('id')
        .eq('id', targetFolderId)
        .eq('user_id', user.id)
        .single()

      if (targetError || !targetFolder) {
        return NextResponse.json(
          { success: false, error: 'Target folder not found' },
          { status: 404 }
        )
      }

      // Move workflows to target folder
      const { error: moveWorkflowsError } = await supabase
        .from('workflows')
        .update({ folder_id: targetFolderId })
        .eq('folder_id', params.id)
        .eq('user_id', user.id)

      if (moveWorkflowsError) {
        throw new Error(`Failed to move workflows: ${moveWorkflowsError.message}`)
      }
    }
    // If no action specified, workflows will have folder_id set to null via ON DELETE SET NULL

    // Delete folder
    const { error } = await supabase
      .from('workflow_folders')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting folder:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete folder' },
      { status: 500 }
    )
  }
}
