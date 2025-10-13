import { NextRequest, NextResponse } from "next/server";
import { listDiscordChannels } from "@/lib/workflows/actions/discord";

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const { config, userId } = await request.json();

    if (!config) {
      return errorResponse("Config is required" , 400)
    }

    // Validate required fields
    const { guildId } = config
    
    if (!guildId) {
      return errorResponse("Guild ID is required" , 400)
    }

    // For preview, we need to get the actual user's Discord integration
    if (!userId) {
      return errorResponse("User ID is required for Discord preview" , 400)
    }

    const input = {};

    // Import the fetch function dynamically to avoid import issues
    const { listDiscordChannels } = await import("../../../../../lib/workflows/actions/discord")

    const result = await listDiscordChannels(config, userId, input);

    if (!result.success) {
      // Handle the case where user doesn't have Discord integration
      if (result.message?.includes("Discord integration not connected") || 
          result.message?.includes("not connected")) {
        return jsonResponse({
          success: false,
          error: "No Discord integration found. Please connect your Discord account first.",
          data: {
            channels: [],
            count: 0
          }
        }, { status: 400 })
      }
      
      return errorResponse(result.message || "Failed to fetch Discord channels" , 500)
    }

    // Return structured preview data
    return jsonResponse({
      success: true,
      data: {
        channels: result.output || [],
        count: result.output?.length || 0,
        guild_id: guildId,
        message: result.message
      }
    })

  } catch (error: any) {
    logger.error("Discord fetch channels preview error:", error)
    return errorResponse(error.message || "Internal server error" , 500)
  }
} 