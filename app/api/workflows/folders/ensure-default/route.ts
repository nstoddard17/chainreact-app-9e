import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

// POST /api/workflows/folders/ensure-default - Ensure user has a default folder
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user already has a default folder
    const { data: existingDefault, error: checkError } = await supabase
      .from('workflow_folders')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single()

    if (existingDefault && !checkError) {
      // User already has a default folder
      return NextResponse.json({
        success: true,
        folderId: existingDefault.id,
        created: false
      })
    }

    // Get user's email from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single()

    const userEmail = profile?.email || user.email || 'User'

    // Call the database function to create default folder
    const { data, error } = await supabase.rpc(
      'create_default_workflow_folder_for_user',
      {
        user_id_param: user.id,
        user_email: userEmail
      }
    )

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      folderId: data,
      created: true
    })
  } catch (error: any) {
    console.error('Error ensuring default folder:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create default folder' },
      { status: 500 }
    )
  }
}
