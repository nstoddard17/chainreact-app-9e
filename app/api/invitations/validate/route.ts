import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/utils/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
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
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 })
    }

    // Check if invitation has expired
    const expiresAt = new Date(invitation.expires_at)
    const now = new Date()
    
    if (now > expiresAt) {
      return NextResponse.json({ error: "Invitation has expired" }, { status: 410 })
    }

    return NextResponse.json({ 
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expires_at,
        organization: invitation.organization
      }
    })
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 