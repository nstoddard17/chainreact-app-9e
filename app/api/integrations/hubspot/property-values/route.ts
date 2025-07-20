import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { getDecryptedAccessToken } from "@/lib/workflows/actions/core/getDecryptedAccessToken"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyName = searchParams.get('property')

    if (!propertyName) {
      return NextResponse.json(
        { error: "Property name is required" },
        { status: 400 }
      )
    }

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

    // Fetch contacts with the specific property
    const response = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts?properties=${propertyName}&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { 
          error: `HubSpot API error: ${response.status} - ${errorData.message || response.statusText}`,
          status: response.status,
          details: errorData
        },
        { status: 500 }
      )
    }

    const data = await response.json()
    
    // Extract unique values from the property
    const uniqueValues = new Set<string>()
    
    data.results.forEach((contact: any) => {
      const value = contact.properties[propertyName]
      if (value && value !== '' && value !== null && value !== undefined) {
        uniqueValues.add(value.toString())
      }
    })

    // Convert to sorted array
    const sortedValues = Array.from(uniqueValues).sort()

    return NextResponse.json({
      success: true,
      data: sortedValues,
      count: sortedValues.length
    })

  } catch (error: any) {
    console.error("HubSpot property values error:", error)
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