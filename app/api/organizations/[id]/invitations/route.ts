import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import crypto from "crypto"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { emailService } from "@/lib/services/emailService"

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]),
  permissions: z.object({}).optional(),
})

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const { email, role, permissions } = inviteSchema.parse(body)

    // Check if user has permission to invite members
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", params.id)
      .eq("user_id", user.id)
      .single()

    if (!membership || membership.role !== "admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Generate invitation token
    const token = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Create invitation
    const { data: invitation, error } = await supabase
      .from("organization_invitations")
      .insert({
        organization_id: params.id,
        email,
        role,
        permissions: permissions || {},
        invited_by: user.id,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating invitation:", error)
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 })
    }

    // Get organization name and inviter email
    const { data: organization } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", params.id)
      .single()

    const { data: inviter } = await supabase
      .from("auth.users")
      .select("email")
      .eq("id", user.id)
      .single()

    // Send invitation email
    const emailSent = await emailService.sendInvitationEmail(
      email,
      organization?.name || "Organization",
      inviter?.email || user.email || "Unknown",
      token,
      role
    )

    if (!emailSent) {
      console.warn(`Failed to send invitation email to ${email}`)
      // Don't fail the request, but log the warning
    }

    console.log(`Invitation created for ${email} with token: ${token}`)

    return NextResponse.json(invitation)
  } catch (error) {
    console.error("Error in POST /api/organizations/[id]/invitations:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Check if user has permission to view invitations
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", params.id)
      .eq("user_id", user.id)
      .single()

    if (!membership || !["admin", "editor"].includes(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const { data: invitations, error } = await supabase
      .from("organization_invitations")
      .select(`
        *,
        invited_by_user:auth.users!organization_invitations_invited_by_fkey(email)
      `)
      .eq("organization_id", params.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching invitations:", error)
      return NextResponse.json({ error: "Failed to fetch invitations" }, { status: 500 })
    }

    return NextResponse.json(invitations)
  } catch (error) {
    console.error("Error in GET /api/organizations/[id]/invitations:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
