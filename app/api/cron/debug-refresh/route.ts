import { NextRequest, NextResponse } from "next/server";
import { LegacyTokenRefreshService } from "@/src/infrastructure/workflows/legacy-compatibility";
import { db } from "@/lib/db";

import { logger } from '@/lib/utils/logger'

/**
 * Debug endpoint for testing token refresh for specific providers
 * 
 * @param request The Next.js request object
 * @returns A JSON response with the refresh results
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const provider = searchParams.get("provider");
  const integrationId = searchParams.get("id");
  
  if (!provider && !integrationId) {
    return errorResponse("Provider or integration ID is required" , 400);
  }
  
  try {
    let integrations;
    
    if (integrationId) {
      // Get a specific integration by ID
      const { data, error } = await db
        .from("integrations")
        .select("*")
        .eq("id", integrationId)
        .limit(1);
        
      if (error) throw error;
      integrations = data;
    } else {
      // Get integrations for a specific provider
      const { data, error } = await db
        .from("integrations")
        .select("*")
        .eq("provider", provider)
        .eq("is_active", true)
        .not("refresh_token", "is", null)
        .limit(10);
        
      if (error) throw error;
      integrations = data;
    }
    
    if (!integrations || integrations.length === 0) {
      return errorResponse("No matching integrations found" , 404);
    }
    
    // Process each integration
    const results = [];
    for (const integration of integrations) {
      if (!integration.refresh_token) {
        results.push({
          provider: integration.provider,
          error: "No refresh token available",
        });
        continue;
      }
      
      const refreshResult = await LegacyTokenRefreshService.refreshTokenForProvider(
        integration.provider,
        integration.refresh_token,
        integration
      );
      
      results.push({
        provider: integration.provider,
        success: refreshResult.success,
        error: refreshResult.error,
        statusCode: refreshResult.statusCode,
        needsReauthorization: refreshResult.needsReauthorization,
      });
    }
    
    return jsonResponse({
      count: results.length,
      results,
    });
  } catch (error: any) {
    logger.error("Error in debug-refresh endpoint:", error);
    return errorResponse(error.message , 500);
  }
}
