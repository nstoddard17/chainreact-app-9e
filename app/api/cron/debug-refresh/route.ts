import { NextRequest, NextResponse } from "next/server";
import { refreshTokenForProvider, getTokensNeedingRefresh } from "@/lib/integrations/tokenRefreshService";
import { db } from "@/lib/db";

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
    return NextResponse.json({ error: "Provider or integration ID is required" }, { status: 400 });
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
      return NextResponse.json({ error: "No matching integrations found" }, { status: 404 });
    }
    
    // Process each integration
    const results = [];
    for (const integration of integrations) {
      if (!integration.refresh_token) {
        results.push({
          id: integration.id,
          provider: integration.provider,
          error: "No refresh token available",
        });
        continue;
      }
      
      console.log(`🔄 Testing token refresh for ${integration.provider} (ID: ${integration.id})`);
      
      const refreshResult = await refreshTokenForProvider(
        integration.provider,
        integration.refresh_token,
        integration
      );
      
      results.push({
        id: integration.id,
        provider: integration.provider,
        success: refreshResult.success,
        error: refreshResult.error,
        statusCode: refreshResult.statusCode,
        needsReauthorization: refreshResult.needsReauthorization,
      });
    }
    
    return NextResponse.json({
      count: results.length,
      results,
    });
  } catch (error: any) {
    console.error("Error in debug-refresh endpoint:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 