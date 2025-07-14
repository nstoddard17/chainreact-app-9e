import { NextRequest, NextResponse } from "next/server";
import { fetchDiscordMessages } from "@/lib/workflows/actions/discord";

export async function POST(request: NextRequest) {
  try {
    const { config, userId } = await request.json();

    if (!config) {
      return NextResponse.json(
        { error: "Config is required" },
        { status: 400 }
      )
    }

    // Validate required fields
    const { guildId, channelId } = config
    
    if (!guildId || !channelId) {
      return NextResponse.json(
        { error: "Guild ID and Channel ID are required" },
        { status: 400 }
      )
    }

    // For preview, we need to get the actual user's Discord integration
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required for Discord preview" },
        { status: 400 }
      )
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
        return NextResponse.json({
          success: false,
          error: "No Discord integration found. Please connect your Discord account first.",
          data: {
            messages: [],
            count: 0
          }
        }, { status: 400 })
      }
      
      return NextResponse.json(
        { error: result.message || "Failed to fetch Discord messages" },
        { status: 500 }
      )
    }

    // Return structured preview data
    return NextResponse.json({
      success: true,
      data: {
        messages: result.output?.messages || [],
        count: result.output?.count || 0,
        channel_id: result.output?.channel_id || "",
        message: result.message
      }
    })

  } catch (error: any) {
    console.error("Discord fetch messages preview error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
} 