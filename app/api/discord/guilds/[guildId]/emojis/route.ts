import { NextRequest, NextResponse } from "next/server";

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!botToken) {
      return errorResponse("Discord bot token not configured" , 500);
    }

    // Fetch guild emojis from Discord API
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/emojis`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      logger.error("Discord API error:", response.status, response.statusText);
      return jsonResponse(
        { error: "Failed to fetch guild emojis" },
        { status: response.status }
      );
    }

    const emojis = await response.json();

    // Transform emojis to the format expected by the picker
    const transformedEmojis = emojis.map((emoji: any) => ({
      id: emoji.id,
      name: emoji.name,
      animated: emoji.animated,
      url: `https://cdn.discordapp.com/emojis/${emoji.id}${emoji.animated ? ".gif" : ".png"}`,
      custom: true,
    }));

    return jsonResponse(transformedEmojis);
  } catch (error) {
    logger.error("Error fetching guild emojis:", error);
    return errorResponse("Internal server error" , 500);
  }
} 