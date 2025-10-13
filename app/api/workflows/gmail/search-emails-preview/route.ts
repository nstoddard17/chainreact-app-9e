import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { searchGmailEmails } from "@/lib/workflows/actions/gmail/searchEmails";

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const { config, userId } = await request.json();

    if (!config) {
      return errorResponse("Config is required" , 400)
    }

    // Validate required fields
    const { query } = config
    
    if (!query) {
      return errorResponse("Query is required" , 400)
    }

    // For preview, we need to get the actual user's Gmail integration
    if (!userId) {
      return errorResponse("User ID is required for Gmail preview" , 400)
    }

    // For preview/sample, always use 1 message regardless of configured maxResults
    const previewConfig = { ...config, maxResults: 1 };
    const input = {};

    // Import the search function dynamically to avoid import issues
    const { searchGmailEmails } = await import("../../../../../lib/workflows/actions/gmail/searchEmails")

    const result = await searchGmailEmails(previewConfig, userId, input);

    if (!result.success) {
      // Handle the case where user doesn't have Gmail integration
      if (result.message?.includes("Gmail integration not connected") || 
          result.message?.includes("not connected") ||
          result.message?.includes("JSON object requested, multiple (or no) rows returned") ||
          result.error?.includes("JSON object requested, multiple (or no) rows returned")) {
        return jsonResponse({
          success: false,
          error: "No Gmail integration found. Please connect your Gmail account first.",
          data: {
            emails: [],
            count: 0
          }
        }, { status: 400 })
      }
      
      return errorResponse(result.message || "Failed to search Gmail emails" , 500)
    }

    // Return structured preview data
    return jsonResponse({
      success: true,
      data: {
        emails: result.output?.emails || [],
        count: result.output?.count || 0,
        query: result.output?.query || "",
        message: result.message
      }
    })

  } catch (error: any) {
    logger.error("Gmail search emails preview error:", error)
    return errorResponse(error.message || "Internal server error" , 500)
  }
} 