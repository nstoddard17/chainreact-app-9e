import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { getFacebookPageInsights } from "@/lib/workflows/actions/facebook";

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const { config, userId } = await request.json();

    if (!config) {
      return errorResponse("Config is required" , 400)
    }

    // Validate required fields
    const { pageId, metric, period, periodCount } = config
    
    if (!pageId) {
      return jsonResponse({
        success: false,
        error: "Please select a Facebook page first.",
        data: {
          insights: [],
          count: 0
        }
      }, { status: 400 })
    }
    
    if (!metric || !period || !periodCount) {
      return errorResponse("Metric, period, and period count are required" , 400)
    }

    // For preview, we need to get the actual user's Facebook integration
    if (!userId) {
      return errorResponse("User ID is required for Facebook preview" , 400)
    }

    // For preview, use a smaller period count to get sample data
    const previewConfig = { ...config, periodCount: Math.min(periodCount, 3) };
    const input = {};

    // Import the fetch function dynamically to avoid import issues
    const { getFacebookPageInsights } = await import("../../../../../lib/workflows/actions/facebook")

    const result = await getFacebookPageInsights(previewConfig, userId, input);

    if (!result.success) {
      
      // Handle the case where user doesn't have Facebook integration
      if (result.message?.includes("Facebook integration not connected") || 
          result.message?.includes("not connected") ||
          result.error?.includes("Facebook integration not connected")) {
        return jsonResponse({
          success: false,
          error: "No Facebook integration found. Please connect your Facebook account first.",
          data: {
            insights: [],
            count: 0
          }
        }, { status: 400 })
      }
      
      // Handle the case where page is not found
      if (result.message?.includes("Page with ID") || 
          result.error?.includes("Page with ID")) {
        return jsonResponse({
          success: false,
          error: "Selected Facebook page not found or access denied. Please check your page selection.",
          data: {
            insights: [],
            count: 0
          }
        }, { status: 400 })
      }
      
      return errorResponse(result.message || result.error || "Failed to fetch Facebook page insights" , 500)
    }

    // Return structured preview data
    return jsonResponse({
      success: true,
      data: {
        insights: result.output?.insights || [],
        count: result.output?.insights?.length || 0,
        pageId: result.output?.pageId || "",
        metric: result.output?.metric || "",
        period: result.output?.period || "",
        periodCount: result.output?.periodCount || 0,
        message: result.message
      }
    })

  } catch (error: any) {
    logger.error("Facebook fetch page insights preview error:", error)
    return errorResponse(error.message || "Internal server error" , 500)
  }
} 