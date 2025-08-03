import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get organization with service client
    const { data: organization, error } = await serviceClient
      .from("organizations")
      .select(`
        *,
        organization_members(user_id, role)
      `)
      .eq("id", id)
      .single()

    if (error) {
      console.error("Error fetching organization:", error)
      return NextResponse.json({ error: "Failed to fetch organization" }, { status: 500 })
    }

    // Check if user has access to this organization
    const userMember = organization.organization_members?.find((member: any) => member.user_id === user.id)
    if (!userMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Return organization with user's role
    const result = {
      ...organization,
      role: userMember.role,
      member_count: organization.organization_members?.length || 1
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, billing_email, billing_address } = body

    // Check if user is organization owner
    const { data: organization, error: checkError } = await serviceClient
      .from("organizations")
      .select("owner_id")
      .eq("id", id)
      .single()

    if (checkError || !organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    if (organization.owner_id !== user.id) {
      return NextResponse.json({ error: "Only organization owners can update settings" }, { status: 403 })
    }

    // Update organization
    const { data: updatedOrg, error: updateError } = await serviceClient
      .from("organizations")
      .update({
        name,
        description,
        billing_email,
        billing_address
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("Error updating organization:", updateError)
      return NextResponse.json({ error: "Failed to update organization" }, { status: 500 })
    }

    return NextResponse.json(updatedOrg)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is organization owner
    const { data: organization, error: checkError } = await serviceClient
      .from("organizations")
      .select("owner_id, name")
      .eq("id", id)
      .single()

    if (checkError || !organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    if (organization.owner_id !== user.id) {
      return NextResponse.json({ error: "Only organization owners can delete organizations" }, { status: 403 })
    }

    // Delete all related data in the correct order (due to foreign key constraints)
    
    // 1. Delete organization invitations
    const { error: invitationsError } = await serviceClient
      .from("organization_invitations")
      .delete()
      .eq("organization_id", id)

    if (invitationsError) {
      console.error("Error deleting invitations:", invitationsError)
    }

    // 2. Delete organization members
    const { error: membersError } = await serviceClient
      .from("organization_members")
      .delete()
      .eq("organization_id", id)

    if (membersError) {
      console.error("Error deleting members:", membersError)
    }

    // 3. Delete audit logs (if they exist)
    try {
      const { error: auditError } = await serviceClient
        .from("audit_logs")
        .delete()
        .eq("organization_id", id)

      if (auditError) {
        console.error("Error deleting audit logs:", auditError)
      }
    } catch (error) {
      // Table might not exist, ignore error
      console.log("Audit logs table not found, skipping deletion")
    }

    // 4. Finally, delete the organization
    const { error: deleteError } = await serviceClient
      .from("organizations")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("Error deleting organization:", deleteError)
      return NextResponse.json({ error: "Failed to delete organization" }, { status: 500 })
    }

    return NextResponse.json({ 
      message: `Organization "${organization.name}" has been permanently deleted`,
      organizationId: id 
    })
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}