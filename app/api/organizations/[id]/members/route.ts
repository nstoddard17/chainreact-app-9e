import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import crypto from "crypto"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is a member of this organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", params.id)
      .eq("user_id", session.user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data, error } = await supabase
      .from("organization_members")
      .select(`
        *,
        user:auth.users(email, user_metadata)
      `)
      .eq("organization_id", params.id)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is an admin of this organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", params.id)
      .eq("user_id", session.user.id)
      .single()

    if (!membership || membership.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { email, role } = body

    // Create invitation
    const token = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

    const { data, error } = await supabase
      .from("organization_invitations")
      .insert({
        organization_id: params.id,
        email,
        role,
        token,
        expires_at: expiresAt.toISOString(),
        invited_by: session.user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log the action
    await supabase.from("audit_logs").insert({
      organization_id: params.id,
      user_id: session.user.id,
      action: "member.invited",
      resource_type: "organization_member",
      details: { email, role },
    })

    // In a real app, send invitation email here
    // await sendInvitationEmail(email, token, orgName)

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
