import { NextRequest, NextResponse } from 'next/server'
import { checkDiscordBotConfig, getDiscordSetupInstructions } from '@/lib/utils/discordConfig'

export async function GET(request: NextRequest) {
  try {
    const config = checkDiscordBotConfig()
    const setupInstructions = getDiscordSetupInstructions()
    
    return NextResponse.json({
      success: true,
      config,
      setupInstructions,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error checking Discord config:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to check Discord configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 