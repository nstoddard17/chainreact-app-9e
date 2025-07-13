import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import type { Integration } from "@/types/integration"
import { detectAvailableIntegrations } from "@/lib/integrations/availableIntegrations"

export async function GET() {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

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

    const availableIntegrations = detectAvailableIntegrations()
    const configuredProviders = new Set(integrations.map((i: Integration) => i.provider))

    // Filter out internal integrations that shouldn't be counted as "disconnected"
    const internalIntegrationIds = ['logic', 'ai']
    const externalIntegrations = availableIntegrations.filter(integration => 
      !internalIntegrationIds.includes(integration.id)
    )

    console.log(`🔍 Integration Metrics Debug:
      - Total available integrations: ${availableIntegrations.length}
      - External integrations (excluding internal): ${externalIntegrations.length}
      - Internal integrations filtered out: ${internalIntegrationIds.join(', ')}
      - User's configured integrations: ${integrations.length}
    `)

    // Calculate metrics and update expired integrations
    const now = new Date()
    const tenMinutesMs = 10 * 60 * 1000

    const metrics = {
      connected: 0,
      expiring: 0, // expiring within the next 10 minutes
      expired: 0,
      disconnected: 0,
      total: externalIntegrations.length || 0,
    }

    const integrationsToUpdate: {
      id: string
      provider: string
      oldStatus: string
      newStatus: string
    }[] = []

    for (const integration of integrations || []) {
      let effectiveStatus = integration.status
      let needsUpdate = false

      // Determine the most accurate status, with time-based expiry taking precedence.
      if (integration.expires_at) {
        const expiresAt = new Date(integration.expires_at)
        if (expiresAt <= now) {
          if (integration.status !== "expired" && integration.status !== "needs_reauthorization") {
            effectiveStatus = "expired"
            needsUpdate = true
          }
        }
      }
      
      // Now, categorize based on the effective status.
      if (effectiveStatus === "disconnected") {
        metrics.disconnected++
      } else if (effectiveStatus === "expired" || effectiveStatus === "needs_reauthorization") {
        metrics.expired++
      } else if (integration.expires_at) {
        const expiresAt = new Date(integration.expires_at)
        const timeUntilExpiry = expiresAt.getTime() - now.getTime()
        
        if (timeUntilExpiry > 0 && timeUntilExpiry < tenMinutesMs) {
          metrics.expiring++
        } else {
          metrics.connected++
        }
      } else {
        metrics.connected++
      }

      if (needsUpdate) {
        integrationsToUpdate.push({
          id: integration.id,
          provider: integration.provider,
          oldStatus: integration.status,
          newStatus: effectiveStatus,
        })
      }
    }
    
    // Calculate disconnected count: available integrations that are not configured
    const configuredCount = metrics.connected + metrics.expiring + metrics.expired
    const availableProviderIds = externalIntegrations.map(integration => integration.id)
    const configuredProviderIds = integrations.map((i: Integration) => i.provider)
    
    // Count only available integrations that are not configured
    const disconnectedCount = availableProviderIds.filter(providerId => 
      !configuredProviderIds.includes(providerId)
    ).length
    
    console.log(`🔍 Disconnected Count Debug:
      - Available external provider IDs: ${availableProviderIds.join(', ')}
      - Configured provider IDs: ${configuredProviderIds.join(', ')}
      - Disconnected count: ${disconnectedCount}
    `)
    
    metrics.disconnected = disconnectedCount
    
    // Log expiring integrations for debugging (can be removed in production)
    const expiringForDebug = integrations.filter((i: Integration) => {
      if(i.expires_at) {
        const expiresAt = new Date(i.expires_at);
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();
        return timeUntilExpiry > 0 && timeUntilExpiry < tenMinutesMs;
      }
      return false;
    });

    if (expiringForDebug.length > 0) {
      console.log(`Found ${expiringForDebug.length} expiring integrations:`, expiringForDebug.map((e: Integration) => e.provider));
    }

    // Update expired integrations in the database
    let updatedCount = 0
    if (integrationsToUpdate.length > 0) {
      console.log(
        `Found ${integrationsToUpdate.length} integrations with outdated status that need updating`,
      )

      for (const item of integrationsToUpdate) {
        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            status: item.newStatus,
            updated_at: now.toISOString(),
          })
          .eq("id", item.id)

        if (updateError) {
          console.error(`Failed to update integration ${item.id} (${item.provider}):`, updateError)
        } else {
          updatedCount++
          console.log(`✅ Updated ${item.provider} status from ${item.oldStatus} to ${item.newStatus}`)
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
