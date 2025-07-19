import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/security/encryption"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(request: Request) {
  try {
    // For debugging purposes, we'll use a specific test user
    // In a production environment, you would use proper authentication
    
    // Get any HubSpot integration that is connected (for debugging)
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("provider", "hubspot")
      .eq("status", "connected")
      .limit(1)
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        {
          success: false,
          error: "HubSpot integration not found or not connected",
        },
        { status: 404 },
      )
    }

    // Decrypt stored tokens
    try {
      const encryptionKey = process.env.ENCRYPTION_KEY || ""

      if (integration.access_token && integration.access_token.includes(":")) {
        integration.access_token = decrypt(integration.access_token, encryptionKey)
      }

      if (integration.refresh_token && integration.refresh_token.includes(":")) {
        integration.refresh_token = decrypt(integration.refresh_token, encryptionKey)
      }
    } catch (decryptionError) {
      console.error("Failed to decrypt integration tokens:", decryptionError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to decrypt integration credentials. Please reconnect your integration.",
        },
        { status: 500 },
      )
    }

    // Fetch all contact properties from HubSpot API
    const response = await fetch(
      "https://api.hubapi.com/crm/v3/properties/contacts",
      {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          {
            success: false,
            error: "HubSpot authentication expired. Please reconnect your account.",
          },
          { status: 401 },
        )
      }
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        {
          success: false,
          error: `HubSpot API error: ${response.status} - ${errorData.message || "Unknown error"}`,
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    
    // Filter for contact table fields
    // HubSpot contact properties are organized by groups
    // The "contactinformation" group contains the standard contact fields
    const contactGroups = ["contactinformation", "contact information", "core contact information"];
    
    // Filter properties that belong to contact table groups
    const contactProperties = data.results?.filter((prop: any) => {
      // Include properties from contact information groups
      const isContactGroup = contactGroups.includes(prop.groupName?.toLowerCase());
      
      // Also include common contact properties regardless of group
      const commonContactFields = [
        "email", "firstname", "lastname", "phone", "address", "city", 
        "state", "zip", "country", "company", "jobtitle", "website"
      ];
      
      return isContactGroup || commonContactFields.includes(prop.name);
    }) || [];
    
    // Return filtered contact properties
    return NextResponse.json({
      success: true,
      totalCount: data.results?.length || 0,
      filteredCount: contactProperties.length,
      results: contactProperties,
      allGroups: [...new Set(data.results?.map((prop: any) => prop.groupName))]
    })

  } catch (error: any) {
    console.error("Error in HubSpot debug endpoint:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "An unexpected error occurred",
      },
      { status: 500 },
    )
  }
}
