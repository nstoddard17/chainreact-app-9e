import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    cookies()
    const supabase = createSupabaseRouteHandlerClient()

    // Use getUser() instead of getSession() for secure authentication
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error("User authentication error:", userError)
      return NextResponse.json({ error: "Authentication error", details: userError.message }, { status: 401 })
    }

    if (!user?.id) {
      console.error("No authenticated user found")
      return NextResponse.json({ error: "Unauthorized - no valid user" }, { status: 401 })
    }

    console.log("🔍 Fetching integrations for authenticated user")

    // Fetch user's integrations with detailed logging
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select(
        "id, user_id, provider, provider_user_id, status, access_token, refresh_token, expires_at, scopes, metadata, created_at, updated_at, disconnected_at, disconnect_reason",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Database error fetching integrations:", error)
      return NextResponse.json(
        {
          error: "Failed to fetch integrations",
          details: error.message,
          code: error.code,
        },
        { status: 500 },
      )
    }

    console.log(`✅ Found ${integrations?.length || 0} integrations for user ${user.id}`)
    
    // Check for expired integrations and update their status in the database
    const now = new Date();
    const expiredIntegrations = [];
    const updatedIntegrations = [];

    if (integrations && integrations.length > 0) {
      console.log("📋 Verifying integrations status:")
      
      for (const integration of integrations) {
        // Check if integration is expired but not marked as such
        if (
          integration.status === "connected" && 
          integration.expires_at && 
          new Date(integration.expires_at) <= now
        ) {
          console.log(`⚠️ Integration ${integration.id} (${integration.provider}) is expired but marked as connected. Updating status...`);
          
          // Update status to expired in database
          const { data, error: updateError } = await supabase
            .from("integrations")
            .update({
              status: "expired",
              updated_at: now.toISOString()
            })
            .eq("id", integration.id)
            .select();
            
          if (updateError) {
            console.error(`Failed to update expired integration ${integration.id}:`, updateError);
          } else {
            console.log(`✅ Updated ${integration.provider} status to expired`);
            integration.status = "expired"; // Update in memory too
            expiredIntegrations.push(integration.provider);
            updatedIntegrations.push(data?.[0] || integration);
          }
        }
        
        console.log(
          `  • ${integration.provider} (${integration.status}) - Expires at: ${
            integration.expires_at || "N/A"
          }`,
        );
      }
      
      if (expiredIntegrations.length > 0) {
        console.log(`🔄 Updated ${expiredIntegrations.length} expired integrations: ${expiredIntegrations.join(', ')}`);
      }
    }

    // Transform the data to ensure consistent format and redact sensitive info
    const transformedIntegrations = (integrations || []).map((integration) => ({
      id: integration.id,
      user_id: integration.user_id,
      provider: integration.provider,
      provider_user_id: integration.provider_user_id,
      status: integration.status || "disconnected",
      access_token: integration.access_token ? "[REDACTED]" : null,
      refresh_token: integration.refresh_token ? "[REDACTED]" : null,
      expires_at: integration.expires_at,
      scopes: integration.scopes,
      metadata: integration.metadata,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
      disconnected_at: integration.disconnected_at,
      disconnect_reason: integration.disconnect_reason,
    }))

    return NextResponse.json({
      success: true,
      data: transformedIntegrations,
      count: transformedIntegrations.length,
      user_id: user.id,
      debug: {
        request_timestamp: new Date().toISOString(),
        status_updates: expiredIntegrations.length > 0 ? {
          expired_count: expiredIntegrations.length,
          expired_providers: expiredIntegrations
        } : undefined
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    })
  } catch (error) {
    console.error("API error in /api/integrations:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
