import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

// POST /api/workflows/folders/[id]/set-default - Set folder as default
export async function POST(
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
    const { data: folder, error: fetchError } = await supabase
      .from('workflow_folders')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !folder) {
      return NextResponse.json(
        { success: false, error: 'Folder not found' },
        { status: 404 }
      )
    }

    // If already default, nothing to do
    if (folder.is_default === true) {
      return NextResponse.json({
        success: true,
        message: 'Folder is already the default folder'
      })
    }

    // Use a transaction to ensure only one default folder
    // First, get the old default folder to remove its description
    const { data: oldDefault } = await supabase
      .from('workflow_folders')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single()

    // Unset the old default folder and clear its description
    if (oldDefault) {
      const { error: unsetError } = await supabase
        .from('workflow_folders')
        .update({
          is_default: false,
          description: null
        })
        .eq('id', oldDefault.id)
        .eq('user_id', user.id)

      if (unsetError) {
        throw unsetError
      }
    }

    // Then set this folder as default and add the description
    const { error: setError } = await supabase
      .from('workflow_folders')
      .update({
        is_default: true,
        description: 'Your default workflow folder'
      })
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (setError) {
      throw setError
    }

    return NextResponse.json({
      success: true,
      message: 'Default folder updated successfully'
    })
  } catch (error: any) {
    console.error('Error setting default folder:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to set default folder' },
      { status: 500 }
    )
  }
}
