import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { fetchDiscordGuildMembers } from '@/lib/workflows/actions/discord'

export async function POST(request: NextRequest) {
  try {
    const { config } = await request.json()
    
    if (!config) {
      return NextResponse.json({ error: 'Config is required' }, { status: 400 })
    }

    // Get user from session
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Call the Discord action function to get preview data
    const result = await fetchDiscordGuildMembers(config, user.id, {})
    
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true, 
      data: result.output,
      message: result.message 
    })

  } catch (error: any) {
    console.error('Error in fetch guild members preview:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch guild members preview' }, 
      { status: 500 }
    )
  }
} 