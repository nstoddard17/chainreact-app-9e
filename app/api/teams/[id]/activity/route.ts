import { NextRequest } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"

export const dynamic = 'force-dynamic'

// GET - Fetch team activity
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params

  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Use service client for performance
    const serviceClient = await createSupabaseServiceClient()

    // Check if user is a member of this team
    const { data: membership } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!membership) {
      return errorResponse("Access denied", 403)
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Fetch activity with user profiles
    const { data: activities, error: activityError } = await serviceClient
      .from("team_activity")
      .select("id, activity_type, description, metadata, created_at, user_id")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (activityError) {
      logger.error('[Team Activity API] Error fetching activities:', activityError)
      throw activityError
    }

    // Get all unique user IDs
    const userIds = [...new Set(activities?.map(a => a.user_id).filter(Boolean))] as string[]

    // Fetch user profiles in batch
    const { data: profiles } = await serviceClient
      .from("user_profiles")
      .select("id, email, full_name, username")
      .in("id", userIds)

    // Merge activities with user data
    const activitiesWithUsers = activities?.map(activity => ({
      ...activity,
      user: activity.user_id ? profiles?.find(p => p.id === activity.user_id) : null
    }))

    return jsonResponse({ activities: activitiesWithUsers || [] })
  } catch (error: any) {
    logger.error('[Team Activity API] Error:', {
      message: error?.message,
      stack: error?.stack
    })
    return errorResponse(error.message || "Failed to fetch team activity", 500)
  }
}

// POST - Log team activity (called by other API routes)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params

  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { activity_type, description, metadata = {} } = body

    if (!activity_type || !description) {
      return errorResponse("activity_type and description are required", 400)
    }

    // Use service client to log activity
    const serviceClient = await createSupabaseServiceClient()

    const { data: activity, error: insertError } = await serviceClient
      .from("team_activity")
      .insert({
        team_id: teamId,
        user_id: user.id,
        activity_type,
        description,
        metadata
      })
      .select()
      .single()

    if (insertError) {
      logger.error('[Team Activity API] Error logging activity:', insertError)
      throw insertError
    }

    return jsonResponse({ activity }, { status: 201 })
  } catch (error: any) {
    logger.error('[Team Activity API] Error logging activity:', {
      message: error?.message,
      stack: error?.stack
    })
    return errorResponse(error.message || "Failed to log activity", 500)
  }
}
