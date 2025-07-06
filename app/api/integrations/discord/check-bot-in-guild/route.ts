import { NextRequest, NextResponse } from "next/server"

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

    // Check if bot is in the guild
    const url = `https://discord.com/api/v10/guilds/${guildId}/members/${botUserId}`
    const response = await fetch(url, {
      headers: { 
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      }
    })

    if (response.status === 200) {
      return NextResponse.json({ present: true })
    } else if (response.status === 404) {
      return NextResponse.json({ present: false })
    } else {
      console.error(`Discord API error: ${response.status} - ${response.statusText}`)
      return NextResponse.json({ error: "Failed to check bot status" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error checking bot in guild:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 