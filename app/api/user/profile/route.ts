import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"

export const dynamic = 'force-dynamic'

// GET - Get user profile
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error) throw error

    return jsonResponse({ profile })
  } catch (error: any) {
    console.error('Error fetching profile:', error)
    return errorResponse(error.message || "Failed to fetch profile", 500)
  }
}

// PUT - Update user profile
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { username, bio, avatar_url } = body

    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (username !== undefined) updates.username = username
    if (bio !== undefined) updates.bio = bio
    if (avatar_url !== undefined) updates.avatar_url = avatar_url

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    return jsonResponse({ profile })
  } catch (error: any) {
    console.error('Error updating profile:', error)
    return errorResponse(error.message || "Failed to update profile", 500)
  }
}
