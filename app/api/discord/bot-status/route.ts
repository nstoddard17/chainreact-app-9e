import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'

/**
 * Verify that the Discord bot is actually a member of the specified guild
 */
async function verifyBotInGuild(guildId: string): Promise<{ isInGuild: boolean; hasPermissions: boolean; error?: string }> {
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN
    const botUserId = process.env.DISCORD_BOT_USER_ID

    if (!botToken || !botUserId) {
      return {
        isInGuild: false,
        hasPermissions: false,
        error: "Discord bot credentials not configured"
      }
    }

    // Method 1: Check guild members list
    try {
      const guildMembersUrl = `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`
      const guildResponse = await fetch(guildMembersUrl, {
        headers: { 
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json"
        }
      })

      if (guildResponse.status === 200) {
        const members = await guildResponse.json()
        const botMember = members.find((member: any) => member.user?.id === botUserId)
        
        if (botMember) {
          // Check if bot has necessary permissions
          const permissions = botMember.permissions
          const hasAdminPerms = (BigInt(permissions) & BigInt(8)) === BigInt(8) // Administrator
          const hasSendMessages = (BigInt(permissions) & BigInt(2048)) === BigInt(2048) // Send Messages
          const hasManageMessages = (BigInt(permissions) & BigInt(8192)) === BigInt(8192) // Manage Messages
          
          return {
            isInGuild: true,
            hasPermissions: hasAdminPerms || (hasSendMessages && hasManageMessages)
          }
        }
      }
    } catch (error) {
      console.error("Error checking guild members:", error)
    }

    // Method 2: Direct member check as fallback
    try {
      const memberUrl = `https://discord.com/api/v10/guilds/${guildId}/members/${botUserId}`
      const memberResponse = await fetch(memberUrl, {
        headers: { 
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json"
        }
      })

      if (memberResponse.status === 200) {
        const memberData = await memberResponse.json()
        if (memberData.user?.id === botUserId) {
          // Check permissions
          const permissions = memberData.permissions
          const hasAdminPerms = (BigInt(permissions) & BigInt(8)) === BigInt(8)
          const hasSendMessages = (BigInt(permissions) & BigInt(2048)) === BigInt(2048)
          const hasManageMessages = (BigInt(permissions) & BigInt(8192)) === BigInt(8192)
          
          return {
            isInGuild: true,
            hasPermissions: hasAdminPerms || (hasSendMessages && hasManageMessages)
          }
        }
      }
    } catch (error) {
      console.error("Error in direct member check:", error)
    }

    return {
      isInGuild: false,
      hasPermissions: false,
      error: "Bot is not a member of this server"
    }
  } catch (error) {
    console.error("Error verifying bot in guild:", error)
    return {
      isInGuild: false,
      hasPermissions: false,
      error: "Failed to verify bot status"
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const guildId = searchParams.get('guildId')

    if (!guildId) {
      return NextResponse.json(
        { error: 'Guild ID is required' },
        { status: 400 }
      )
    }

    // Verify user is authenticated
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user has Discord integration
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "discord")
      .eq("status", "connected")
      .single()

    if (!integration) {
      return NextResponse.json(
        { error: 'Discord integration not connected' },
        { status: 400 }
      )
    }

    // Check bot status in the guild
    const botStatus = await verifyBotInGuild(guildId)

    return NextResponse.json(botStatus)
  } catch (error) {
    console.error('Error checking Discord bot status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 