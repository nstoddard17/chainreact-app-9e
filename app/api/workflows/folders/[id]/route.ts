import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

// PUT /api/workflows/folders/[id] - Update folder
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Delete folder (workflows will have folder_id set to null via ON DELETE SET NULL)
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
