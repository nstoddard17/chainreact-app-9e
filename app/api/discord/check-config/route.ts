import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

export async function GET() {
  try {
    // Check if Discord bot credentials are configured
    const botToken = process.env.DISCORD_BOT_TOKEN
    const botUserId = process.env.DISCORD_CLIENT_ID // Use client ID as bot user ID
    
    const isConfigured = !!(botToken && botUserId)
    
    return jsonResponse({
      success: true,
      isConfigured,
      missingVars: isConfigured ? [] : [
        ...(!botToken ? ['DISCORD_BOT_TOKEN'] : []),
        ...(!botUserId ? ['DISCORD_CLIENT_ID'] : [])
      ]
    })
    
  } catch (error: any) {
    return jsonResponse({
      success: false,
      isConfigured: false,
      error: error.message || "Failed to check Discord configuration"
    }, { status: 500 })
  }
} 