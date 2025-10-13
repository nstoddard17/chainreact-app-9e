import { NextRequest, NextResponse } from "next/server"

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const { guildId } = await request.json()
    
    if (!guildId) {
      return errorResponse("Guild ID is required" , 400)
    }

    const botToken = process.env.DISCORD_BOT_TOKEN
    const botUserId = process.env.DISCORD_CLIENT_ID

    if (!botToken || !botUserId) {
      return errorResponse("Bot configuration missing", 500, {
        botToken: !!botToken,
        botUserId: !!botUserId
      })
    }

    logger.debug(`🔍 Debug: Fetching channels for guild ${guildId}`)

    // Fetch all channels
    const channelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!channelsResponse.ok) {
      return jsonResponse({ 
        error: `Failed to fetch channels: ${channelsResponse.status}`,
        status: channelsResponse.status
      }, { status: 500 })
    }

    const allChannels = await channelsjsonResponse()
    const textChannels = allChannels.filter((channel: any) => channel.type === 0)
    
    logger.debug(`📋 Found ${textChannels.length} text channels`)

    // Get bot's guild member info to check permissions
    const memberResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${botUserId}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
    })

    let guildPermissions = BigInt(0)
    if (memberResponse.status === 200) {
      const memberData = await memberjsonResponse()
      guildPermissions = BigInt(memberData.permissions || 0)
      logger.debug(`🔑 Bot guild permissions: ${guildPermissions.toString()}`)
    }

    // Check permissions for each channel
    const VIEW_CHANNEL = BigInt(0x400)
    const SEND_MESSAGES = BigInt(0x800)
    
    const canViewChannel = (guildPermissions & VIEW_CHANNEL) !== BigInt(0)
    const canSendMessages = (guildPermissions & SEND_MESSAGES) !== BigInt(0)
    
    logger.debug(`🔑 Bot can view channels: ${canViewChannel}`)
    logger.debug(`🔑 Bot can send messages: ${canSendMessages}`)

    // Check individual channel permissions
    const channelsWithAccess = await Promise.all(
      textChannels.map(async (channel: any) => {
        try {
          const channelResponse = await fetch(`https://discord.com/api/v10/channels/${channel.id}`, {
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
          })

          const accessible = channelResponse.status === 200
          logger.debug(`📋 Channel ${channel.name}: accessible=${accessible} (status=${channelResponse.status})`)
          
          return {
            id: channel.id,
            name: channel.name,
            accessible,
            status: channelResponse.status
          }
        } catch (error) {
          logger.debug(`❌ Channel ${channel.name}: error checking access`)
          return {
            id: channel.id,
            name: channel.name,
            accessible: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      })
    )

    const accessibleChannels = channelsWithAccess.filter((channel: any) => channel.accessible)
    
    logger.debug(`✅ Found ${accessibleChannels.length} accessible channels out of ${textChannels.length} total`)

    return jsonResponse({
      success: true,
      guildId,
      totalChannels: textChannels.length,
      accessibleChannels: accessibleChannels.length,
      botPermissions: {
        canViewChannel,
        canSendMessages,
        guildPermissions: guildPermissions.toString()
      },
      channels: channelsWithAccess
    })

  } catch (error: any) {
    logger.error("❌ Debug Discord channels error:", error)
    return errorResponse(error.message || "Internal server error" 
    , 500)
  }
} 