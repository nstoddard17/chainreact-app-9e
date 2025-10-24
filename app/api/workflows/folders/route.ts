import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

// GET /api/workflows/folders - List all folders
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: folders, error } = await supabase
      .from('workflow_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true })

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, folders: folders || [] })
  } catch (error: any) {
    console.error('Error fetching folders:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch folders' },
      { status: 500 }
    )
  }
}

// POST /api/workflows/folders - Create a new folder
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, color, icon, parent_folder_id, organization_id } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Folder name is required' },
        { status: 400 }
      )
    }

    const { data: folder, error } = await supabase
      .from('workflow_folders')
      .insert({
        name: name.trim(),
        description: description || null,
        user_id: user.id,
        color: color || '#3B82F6',
        icon: icon || 'folder',
        parent_folder_id: parent_folder_id || null,
        organization_id: organization_id || null,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, folder })
  } catch (error: any) {
    console.error('Error creating folder:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create folder' },
      { status: 500 }
    )
  }
}
