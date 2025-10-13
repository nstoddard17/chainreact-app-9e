import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Use service client to bypass RLS and handle security manually
    const { data: organizations, error } = await serviceClient
      .from("organizations")
      .select(`
        *,
        organization_members!inner(user_id, role)
      `)
      .eq("organization_members.user_id", user.id)

    if (error) {
      logger.error("Error fetching organizations:", error)
      return errorResponse("Failed to fetch organizations" , 500)
    }

    // Transform the data to match the expected format
    const transformedOrganizations = organizations.map((org: any) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      description: org.description,
      logo_url: org.logo_url,
      settings: org.settings,
      owner_id: org.owner_id,
      billing_email: org.billing_email,
      billing_address: org.billing_address,
      created_at: org.created_at,
      updated_at: org.updated_at,
      role: org.organization_members[0]?.role || 'viewer',
      member_count: org.organization_members?.length || 1
    }))

    return jsonResponse(transformedOrganizations)
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const body = await request.json()
    const { name, slug, description } = body

    // Validate required fields
    if (!name || !slug) {
      return errorResponse("Name and slug are required" , 400)
    }

    // Check if slug already exists using service client
    const { data: existingOrg, error: checkError } = await serviceClient
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .single()

    if (existingOrg) {
      return errorResponse("Organization slug already exists" , 409)
    }

    // Create organization using service client
    const { data: organization, error: createError } = await serviceClient
      .from("organizations")
      .insert({
        name,
        slug,
        description,
        owner_id: user.id,
        settings: {},
        billing_address: {}
      })
      .select()
      .single()

    if (createError) {
      logger.error("Error creating organization:", createError)
      return errorResponse("Failed to create organization" , 500)
    }

    // Add creator as admin member using service client
    const { error: memberError } = await serviceClient
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: "admin"
      })

    if (memberError) {
      logger.error("Error creating member:", memberError)
      // Don't fail the request, organization was created successfully
    }

    // Return the created organization with role
    const result = {
      ...organization,
      role: "admin",
      member_count: 1
    }

    return jsonResponse(result, { status: 201 })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
}