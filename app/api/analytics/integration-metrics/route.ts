import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function GET() {
  try {
    cookies()
    const supabase = createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Get all integrations for this user
    const { data: integrations, error: integrationsError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)

    if (integrationsError) {
      return NextResponse.json({ error: integrationsError.message }, { status: 500 })
    }

    // Calculate metrics and update expired integrations
    const now = new Date()
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000)

    const metrics = {
      connected: 0,
      expiring: 0, // expiring within the next 10 minutes
      expired: 0,
      disconnected: 0,
      total: integrations?.length || 0
    }

    // Track integrations that need status updates
    const integrationsToUpdate = [];

    for (const integration of integrations || []) {
      // First determine actual status based on expiry dates
      let actualStatus = integration.status;
      
      // Check if integration is expired based on expires_at date
      if (integration.expires_at) {
        const expiresAt = new Date(integration.expires_at);
        
        if (expiresAt <= now && integration.status === "connected") {
          // Token is expired but status doesn't reflect that
          actualStatus = "expired";
          integrationsToUpdate.push({
            id: integration.id,
            provider: integration.provider,
            oldStatus: integration.status,
            newStatus: "expired"
          });
        }
      }
      
      // Update metrics based on actual status or expire date
      if (integration.status === "disconnected" || actualStatus === "disconnected") {
        metrics.disconnected++;
      } else if (integration.status === "expired" || integration.status === "needs_reauthorization" || actualStatus === "expired") {
        metrics.expired++;
      } else if (integration.expires_at) {
        const expiresAt = new Date(integration.expires_at);
        
        if (expiresAt <= now) {
          metrics.expired++;
        } else if (expiresAt <= tenMinutesFromNow) {
          metrics.expiring++;
        } else {
          metrics.connected++;
        }
      } else {
        metrics.connected++;
      }
    }

    // Update expired integrations in the database
    let updatedCount = 0;
    if (integrationsToUpdate.length > 0) {
      console.log(`Found ${integrationsToUpdate.length} integrations with outdated status that need updating`);
      
      for (const item of integrationsToUpdate) {
        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            status: item.newStatus,
            updated_at: now.toISOString()
          })
          .eq("id", item.id);
        
        if (updateError) {
          console.error(`Failed to update integration ${item.id} (${item.provider}):`, updateError);
        } else {
          updatedCount++;
          console.log(`✅ Updated ${item.provider} status from ${item.oldStatus} to ${item.newStatus}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: metrics,
      statusUpdates: updatedCount > 0 ? {
        updated: updatedCount,
        total: integrationsToUpdate.length
      } : undefined
    })
  } catch (error: any) {
    console.error("Failed to fetch integration metrics:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch integration metrics",
      },
      { status: 500 }
    )
  }
} 