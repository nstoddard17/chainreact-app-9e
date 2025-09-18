import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { getDecryptedAccessToken } from "@/lib/workflows/actions/core/getDecryptedAccessToken"

export async function GET(request: NextRequest) {
  try {
    // Get user from session
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get HubSpot integration
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "hubspot")
      .eq("status", "connected")
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: "HubSpot integration not found or not connected" },
        { status: 404 }
      )
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(user.id, "hubspot")

    // First, get the default view/table columns for contacts
    // HubSpot typically shows these fields in the contacts table by default
    const defaultTableColumns = [
      "firstname",
      "lastname",
      "email",
      "phone",
      "company",
      "jobtitle",
      "hs_lead_status",
      "lifecyclestage",
      "createdate",
      "lastmodifieddate",
      "hubspot_owner_id"
    ]

    // Fetch contact properties to get details about these specific fields
    const propertiesResponse = await fetch(
      "https://api.hubapi.com/crm/v3/properties/contacts",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!propertiesResponse.ok) {
      const errorData = await propertiesResponse.json().catch(() => ({}))
      return NextResponse.json(
        {
          error: `HubSpot API error: ${propertiesResponse.status} - ${errorData.message || propertiesResponse.statusText}`,
          status: propertiesResponse.status,
          details: errorData
        },
        { status: 500 }
      )
    }

    const propertiesData = await propertiesResponse.json()

    // Filter to only the properties that are shown in the table
    const tableProperties = propertiesData.results
      .filter((prop: any) => defaultTableColumns.includes(prop.name))
      .map((prop: any) => ({
        name: prop.name,
        label: prop.label,
        type: prop.type,
        fieldType: prop.fieldType,
        description: prop.description,
        groupName: prop.groupName,
        options: prop.options || [],
        required: prop.name === 'email' // Email is always required for contacts
      }))

    // Sort them in the order they typically appear
    const orderedProperties = defaultTableColumns
      .map(colName => tableProperties.find((p: any) => p.name === colName))
      .filter(Boolean)

    return NextResponse.json({
      success: true,
      data: orderedProperties,
      message: "These are the fields typically shown in the HubSpot contacts table"
    })

  } catch (error: any) {
    console.error("HubSpot contact table columns error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}