import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("You must be logged in to accept an invitation" , 401)
    }

    const body = await request.json()
    const { token } = body

    if (!token) {
      return errorResponse("Token is required" , 400)
    }

    // Get invitation details
    const { data: invitation, error: inviteError } = await serviceClient
      .from("organization_invitations")
      .select(`
        *,
        organization:organizations(id, name, slug)
      `)
      .eq("token", token)
      .eq("accepted_at", null) // Not already accepted
      .single()

    if (inviteError || !invitation) {
      return errorResponse("Invalid or expired invitation" , 404)
    }

    // Check if invitation has expired
    const expiresAt = new Date(invitation.expires_at)
    const now = new Date()
    
    if (now > expiresAt) {
      return errorResponse("Invitation has expired" , 410)
    }

    // Check if user is already a member of this organization
    const { data: existingMember, error: memberCheckError } = await serviceClient
      .from("organization_members")
      .select("id")
      .eq("organization_id", invitation.organization_id)
      .eq("user_id", user.id)
      .single()

    if (existingMember) {
      return errorResponse("You are already a member of this organization" , 409)
    }

    // Add user to organization
    const { data: newMember, error: addError } = await serviceClient
      .from("organization_members")
      .insert({
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role
      })
      .select("*")
      .single()

    if (addError) {
      logger.error("Error adding member:", addError)
      return errorResponse("Failed to add you to the organization" , 500)
    }

    // Mark invitation as accepted
    const { error: updateError } = await serviceClient
      .from("organization_invitations")
      .update({ 
        accepted_at: new Date().toISOString(),
        accepted_by: user.id
      })
      .eq("id", invitation.id)

    if (updateError) {
      logger.error("Error updating invitation:", updateError)
      // Don't fail the whole request if this fails
    }

    return jsonResponse({ 
      success: true,
      message: `Successfully joined ${invitation.organization.name}`,
      organization: invitation.organization
    })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
} 