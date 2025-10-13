import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { fetchDiscordMessages } from "@/lib/workflows/actions/discord";

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const { config, userId } = await request.json();

    if (!config) {
      return errorResponse("Config is required" , 400)
    }

    // Validate required fields
    const { guildId, channelId } = config
    
    if (!guildId || !channelId) {
      return errorResponse("Guild ID and Channel ID are required" , 400)
    }

    // For preview, we need to get the actual user's Discord integration
    if (!userId) {
      return errorResponse("User ID is required for Discord preview" , 400)
    }

    // Use a small limit for preview
    const previewConfig = { ...config, limit: 5 };
    const input = {};

    // Import the fetch function dynamically to avoid import issues
    const { fetchDiscordMessages } = await import("../../../../../lib/workflows/actions/discord")

    const result = await fetchDiscordMessages(previewConfig, userId, input);

    if (!result.success) {
      // Handle the case where user doesn't have Discord integration
      if (result.message?.includes("Discord integration not connected") || 
          result.message?.includes("not connected")) {
        return jsonResponse({
          success: false,
          error: "No Discord integration found. Please connect your Discord account first.",
          data: {
            messages: [],
            count: 0
          }
        }, { status: 400 })
      }
      
      return errorResponse(result.message || "Failed to fetch Discord messages" , 500)
    }

    // Return structured preview data
    return jsonResponse({
      success: true,
      data: {
        messages: result.output?.messages || [],
        count: result.output?.count || 0,
        channel_id: result.output?.channel_id || "",
        message: result.message
      }
    })

  } catch (error: any) {
    logger.error("Discord fetch messages preview error:", error)
    return errorResponse(error.message || "Internal server error" , 500)
  }
} 