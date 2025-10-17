import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  logger.debug('📍 [API /api/integrations] GET request received', {
    timestamp: new Date().toISOString(),
    headers: {
      referer: 'check-console', // Will be logged from request
    }
  });
  
  try {
    // First get the user from the regular client
    const supabaseAuth = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      logger.error('❌ [API /api/integrations] Auth error', { 
        userError,
        hasUser: !!user 
      });
      return errorResponse("Not authenticated" , 401)
    }

    logger.debug('✅ [API /api/integrations] User authenticated', { userId: user.id });

    // Use service role client to bypass RLS for reading integrations
    const supabaseService = await createSupabaseServiceClient()
    const { data: integrations, error: integrationsError } = await supabaseService
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
    
    logger.debug('📊 [API /api/integrations] Query result', {
      count: integrations?.length || 0,
      error: integrationsError,
      errorMessage: integrationsError?.message,
      errorCode: integrationsError?.code,
      firstFew: integrations?.slice(0, 2).map(i => ({ 
        provider: i.provider, 
        status: i.status 
      }))
    });

    if (integrationsError) {
      logger.error('❌ [API /api/integrations] Database error:', {
        message: integrationsError.message,
        code: integrationsError.code,
        details: integrationsError.details,
        hint: integrationsError.hint
      });
      return errorResponse(integrationsError.message , 500)
    }

    // Check for expired integrations and update their status
    const now = new Date()
    const expiredIntegrationIds: string[] = []
    const expiredProviders: string[] = []

    // First, identify all expired integrations
    for (const integration of integrations || []) {
      if (
        integration.status === "connected" &&
        integration.expires_at &&
        new Date(integration.expires_at) <= now
      ) {
        expiredIntegrationIds.push(integration.id)
        expiredProviders.push(integration.provider)
      }
    }

    // Batch update all expired integrations at once
    if (expiredIntegrationIds.length > 0) {
      await supabaseService
        .from("integrations")
        .update({
          status: "expired",
          updated_at: now.toISOString(),
        })
        .in("id", expiredIntegrationIds)
    }

    // Update the integrations array with the corrected statuses
    const updatedIntegrations = integrations?.map((integration) => {
      if (expiredIntegrationIds.includes(integration.id)) {
        return { ...integration, status: "expired" }
      }
      return integration
    })

    return jsonResponse({
      success: true,
      data: updatedIntegrations || [],
    })
  } catch (error: any) {
    return jsonResponse(
      {
        success: false,
        error: error.message || "Failed to fetch integrations",
      },
      { status: 500 }
    )
  }
}
