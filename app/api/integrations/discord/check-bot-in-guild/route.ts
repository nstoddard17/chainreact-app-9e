import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  // Debug endpoint to check bot configuration
  try {
    const botUserId = process.env.DISCORD_BOT_USER_ID
    const botToken = process.env.DISCORD_BOT_TOKEN

    if (!botUserId || !botToken) {
      return NextResponse.json({ 
        error: "Bot configuration missing",
        botUserId: botUserId ? "SET" : "MISSING",
        botToken: botToken ? "SET" : "MISSING"
      })
    }

    // Test bot credentials
    const botInfoResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { 
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      }
    })

    if (botInfoResponse.status === 200) {
      const botInfo = await botInfoResponse.json()
      
      // Also get the guilds the bot is in
      const guildsResponse = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { 
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json"
        }
      })

      let guilds = []
      if (guildsResponse.status === 200) {
        guilds = await guildsResponse.json()
      }

      return NextResponse.json({
        status: "Bot credentials valid",
        botUserId: botUserId,
        botInfo: {
          id: botInfo.id,
          username: botInfo.username,
          discriminator: botInfo.discriminator
        },
        idMatch: botInfo.id === botUserId,
        guilds: guilds.map((g: any) => ({ id: g.id, name: g.name }))
      })
    } else {
      return NextResponse.json({
        error: "Bot credentials invalid",
        status: botInfoResponse.status,
        statusText: botInfoResponse.statusText
      })
    }
  } catch (error) {
    return NextResponse.json({
      error: "Error testing bot credentials",
      message: error instanceof Error ? error.message : "Unknown error"
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { guildId } = await request.json()
    
    if (!guildId) {
      return NextResponse.json({ error: "Guild ID is required" }, { status: 400 })
    }

    // Bot credentials from environment variables
    const botUserId = process.env.DISCORD_BOT_USER_ID
    const botToken = process.env.DISCORD_BOT_TOKEN

    if (!botUserId || !botToken) {
      console.error("Missing Discord bot credentials in environment variables")
      return NextResponse.json({ error: "Bot configuration missing" }, { status: 500 })
    }

    // First, verify bot credentials are valid by checking bot's own user info
    try {
      const botInfoResponse = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { 
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json"
        }
      })

      if (botInfoResponse.status !== 200) {
        return NextResponse.json({ error: "Invalid bot credentials" }, { status: 500 })
      }

      const botInfo = await botInfoResponse.json()
      
      if (botInfo.id !== botUserId) {
        return NextResponse.json({ error: "Bot user ID mismatch" }, { status: 500 })
      }
    } catch (credentialError) {
      return NextResponse.json({ error: "Failed to verify bot credentials" }, { status: 500 })
    }

    // Check if bot is in the guild by fetching guild members
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
          return NextResponse.json({ present: true })
        } else {
          return NextResponse.json({ present: false })
        }
      } else if (guildResponse.status === 403) {
        // Bot doesn't have permission to view guild members
        return NextResponse.json({ present: false, error: "Insufficient permissions" })
      } else if (guildResponse.status === 404) {
        // Guild not found or bot not in guild
        return NextResponse.json({ present: false })
      } else {
        return NextResponse.json({ error: "Failed to check bot status" }, { status: 500 })
      }
    } catch (guildError) {
      // Fallback method: Try direct member check
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
            return NextResponse.json({ present: true })
          } else {
            return NextResponse.json({ present: false })
          }
        } else if (memberResponse.status === 404) {
          return NextResponse.json({ present: false })
        } else if (memberResponse.status === 403) {
          return NextResponse.json({ present: false, error: "Insufficient permissions" })
        } else {
          return NextResponse.json({ present: false, error: "Unexpected API response" })
        }
      } catch (memberError) {
        // Ignore fallback errors
      }
      
      return NextResponse.json({ present: false, error: "Failed to verify bot membership" })
    }
  } catch (error) {
    console.error("❌ Error checking bot in guild:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 