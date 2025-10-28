import { NextRequest } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

// GET - Get user's notifications
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const searchParams = request.nextUrl.searchParams
    const unreadOnly = searchParams.get('unread') === 'true'

    let query = serviceClient
      .from("notifications")
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data: notifications, error } = await query

    if (error) {
      logger.error("Error fetching notifications:", error)
      return errorResponse("Failed to fetch notifications", 500)
    }

    logger.debug("Notifications API response:", {
      userId: user.id,
      unreadOnly,
      count: notifications?.length || 0,
      notifications: notifications?.map(n => ({ id: n.id, type: n.type, title: n.title, is_read: n.is_read }))
    })

    return jsonResponse({ notifications: notifications || [] })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

// PATCH - Mark notification(s) as read
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { notification_ids, mark_all } = body

    if (mark_all) {
      // Mark all notifications as read
      const { error: updateError } = await serviceClient
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)

      if (updateError) {
        logger.error("Error marking all notifications as read:", updateError)
        return errorResponse("Failed to mark notifications as read", 500)
      }

      return jsonResponse({ message: "All notifications marked as read" })
    }

    if (!notification_ids || !Array.isArray(notification_ids)) {
      return errorResponse("notification_ids array is required", 400)
    }

    // Mark specific notifications as read
    const { error: updateError } = await serviceClient
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', notification_ids)
      .eq('user_id', user.id)

    if (updateError) {
      logger.error("Error marking notifications as read:", updateError)
      return errorResponse("Failed to mark notifications as read", 500)
    }

    return jsonResponse({ message: "Notifications marked as read" })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

// DELETE - Delete notification(s)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const searchParams = request.nextUrl.searchParams
    const notificationId = searchParams.get('id')

    if (!notificationId) {
      return errorResponse("Notification ID is required", 400)
    }

    // Delete notification
    const { error: deleteError } = await serviceClient
      .from("notifications")
      .delete()
      .eq('id', notificationId)
      .eq('user_id', user.id)

    if (deleteError) {
      logger.error("Error deleting notification:", deleteError)
      return errorResponse("Failed to delete notification", 500)
    }

    return jsonResponse({ message: "Notification deleted" })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
