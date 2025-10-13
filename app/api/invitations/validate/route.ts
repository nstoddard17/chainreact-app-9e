import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return errorResponse("Token is required" , 400)
    }

    const serviceClient = await createSupabaseServiceClient()

    // Get invitation details
    const { data: invitation, error: inviteError } = await serviceClient
      .from("organization_invitations")
      .select(`
        *,
        organization:organizations(name, slug)
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

    return jsonResponse({ 
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expires_at,
        organization: invitation.organization
      }
    })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
} 