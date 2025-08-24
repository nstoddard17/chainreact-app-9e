import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    
    console.log('🔍 Discord config check:', {
      clientId: clientId ? 'Present' : 'Missing',
      botToken: botToken ? 'Present' : 'Missing',
      env_DISCORD_CLIENT_ID: !!process.env.DISCORD_CLIENT_ID,
      env_NEXT_PUBLIC_DISCORD_CLIENT_ID: !!process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
      env_DISCORD_BOT_TOKEN: !!process.env.DISCORD_BOT_TOKEN
    });
    
    if (!clientId) {
      return NextResponse.json(
        { 
          configured: false,
          error: 'Discord client ID not configured',
          details: {
            DISCORD_CLIENT_ID: !!process.env.DISCORD_CLIENT_ID,
            NEXT_PUBLIC_DISCORD_CLIENT_ID: !!process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
          }
        },
        { status: 400 }
      )
    }

    if (!botToken) {
      return NextResponse.json(
        { 
          configured: false,
          error: 'Discord bot token not configured',
          details: {
            DISCORD_BOT_TOKEN: !!process.env.DISCORD_BOT_TOKEN
          }
        },
        { status: 400 }
      )
    }

    // Return the client ID (it's safe to expose since it's public)
    return NextResponse.json({
      configured: true,
      clientId: clientId,
      hasBotToken: true
    })
  } catch (error) {
    console.error('Error checking Discord config:', error)
    return NextResponse.json(
      { 
        configured: false,
        error: 'Internal server error' 
      },
      { status: 500 }
    )
  }
}