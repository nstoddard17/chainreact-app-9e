import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'

/**
 * GET /api/organizations/[id]/members/me
 * Get the current user's organization-level role in the specified organization
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const { id: orgId } = await params

    // Check if user has an organization-level role
    const { data: member, error: memberError } = await supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (memberError) {
      console.error('Error fetching organization member:', memberError)
      return errorResponse("Failed to fetch organization membership", 500)
    }

    // If no org-level role, user might still be a member via team membership
    if (!member) {
      return jsonResponse({ member: null })
    }

    return jsonResponse({ member })
  } catch (error) {
    console.error('Unexpected error:', error)
    return errorResponse("Internal server error", 500)
  }
}
