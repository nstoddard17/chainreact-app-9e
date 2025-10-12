import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: organizationId } = await params
  try {
    logger.debug('Invitations API: Starting request for organization:', organizationId)
    
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      logger.debug('Invitations API: User not authenticated')
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    logger.debug('Invitations API: User authenticated:', user.id)

    // Check if user is a member of this organization
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single()

    logger.debug('Invitations API: Membership check result:', { membership, membershipError })

    if (membershipError || !membership) {
      logger.debug('Invitations API: Access denied - user not a member')
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Only admins can view invitations
    if (membership.role !== 'admin') {
      logger.debug('Invitations API: Insufficient permissions - user role:', membership.role)
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    logger.debug('Invitations API: User is admin, fetching invitations')

    // Get pending invitations
    const { data: invitations, error } = await serviceClient
      .from("organization_invitations")
      .select("*")
      .eq("organization_id", organizationId)
      .is("accepted_at", null) // Use IS NULL instead of = null
      .order("created_at", { ascending: false })

    logger.debug('Invitations API: Fetch result:', { invitations, error })

    if (error) {
      logger.error("Error fetching invitations:", error)
      return NextResponse.json({ error: "Failed to fetch invitations" }, { status: 500 })
    }

    return NextResponse.json(invitations || [])
  } catch (error) {
    logger.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: organizationId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const invitationId = searchParams.get('invitationId')

    if (!invitationId) {
      return NextResponse.json({ error: "Invitation ID is required" }, { status: 400 })
    }

    // Check if user is admin of the organization
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single()

    if (membershipError || !membership || membership.role !== 'admin') {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Delete the invitation
    const { error: deleteError } = await serviceClient
      .from("organization_invitations")
      .delete()
      .eq("id", invitationId)
      .eq("organization_id", organizationId)

    if (deleteError) {
      logger.error("Error deleting invitation:", deleteError)
      return NextResponse.json({ error: "Failed to delete invitation" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
