import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
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

    const body = await request.json()
    const { email, role = "viewer" } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
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

    // Get organization details
    const { data: organization, error: orgError } = await serviceClient
      .from("organizations")
      .select("name, slug")
      .eq("id", organizationId)
      .single()

    if (orgError || !organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    // Check if user is already a member
    const { data: existingMember, error: memberCheckError } = await serviceClient
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", email) // For now, using email as user_id
      .single()

    if (existingMember) {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 })
    }

    // Create invitation token
    const token = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

    // Store invitation in database
    const { data: invitation, error: inviteError } = await serviceClient
      .from("organization_invitations")
      .insert({
        organization_id: organizationId,
        email,
        role,
        token,
        expires_at: expiresAt.toISOString(),
        invited_by: user.id
      })
      .select("*")
      .single()

    if (inviteError) {
      console.error("Error creating invitation:", inviteError)
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 })
    }

    // Send invitation email
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const inviteUrl = `${baseUrl}/invite?token=${token}&org=${organization.slug}`

      await resend.emails.send({
        from: 'ChainReact <noreply@chainreact.app>',
        to: email,
        subject: `You're invited to join ${organization.name} on ChainReact`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1f2937;">You're invited to join ${organization.name}!</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              You've been invited to join <strong>${organization.name}</strong> on ChainReact as a <strong>${role}</strong>.
            </p>
            <p style="color: #6b7280; line-height: 1.6;">
              ChainReact is a powerful workflow automation platform that helps teams build and manage complex workflows.
            </p>
            <div style="margin: 30px 0;">
              <a href="${inviteUrl}" 
                 style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              This invitation expires on ${expiresAt.toLocaleDateString()}. 
              If you don't have a ChainReact account, you'll be able to create one when you accept the invitation.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        `
      })

      return NextResponse.json({ 
        success: true, 
        message: "Invitation sent successfully",
        invitation 
      })
    } catch (emailError) {
      console.error("Error sending email:", emailError)
      // Delete the invitation if email fails
      await serviceClient
        .from("organization_invitations")
        .delete()
        .eq("id", invitation.id)
      
      return NextResponse.json({ error: "Failed to send invitation email" }, { status: 500 })
    }
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 