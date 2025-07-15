import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Check if Discord bot credentials are configured
    const botToken = process.env.DISCORD_BOT_TOKEN
    const botUserId = process.env.DISCORD_BOT_USER_ID
    
    const isConfigured = !!(botToken && botUserId)
    
    return NextResponse.json({
      success: true,
      isConfigured,
      missingVars: isConfigured ? [] : [
        ...(!botToken ? ['DISCORD_BOT_TOKEN'] : []),
        ...(!botUserId ? ['DISCORD_BOT_USER_ID'] : [])
      ]
    })
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      isConfigured: false,
      error: error.message || "Failed to check Discord configuration"
    }, { status: 500 })
  }
} 