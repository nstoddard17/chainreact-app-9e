import { NextRequest, NextResponse } from 'next/server'
import { discordGateway } from '@/lib/integrations/discordGateway'
import { checkDiscordBotConfig } from '@/lib/utils/discordConfig'

export async function GET(request: NextRequest) {
  try {
    // Get bot configuration status
    const config = checkDiscordBotConfig()
    
    // Get gateway diagnostics
    const diagnostics = discordGateway.getDiagnostics()
    
    // Calculate connection quality
    const timeSinceLastSuccess = diagnostics.timeSinceLastSuccess
    let connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected'
    
    if (!diagnostics.isConnected) {
      connectionQuality = 'disconnected'
    } else if (timeSinceLastSuccess < 30000) { // Less than 30 seconds
      connectionQuality = 'excellent'
    } else if (timeSinceLastSuccess < 120000) { // Less than 2 minutes
      connectionQuality = 'good'
    } else {
      connectionQuality = 'poor'
    }
    
    const status = {
      // Configuration
      botConfigured: config.isConfigured,
      missingConfig: config.missingVars,
      
      // Connection status
      isConnected: diagnostics.isConnected,
      connectionQuality,
      sessionId: diagnostics.sessionId,
      
      // Health metrics
      reconnectAttempts: diagnostics.reconnectAttempts,
      lastSuccessfulConnection: diagnostics.lastSuccessfulConnection,
      timeSinceLastSuccess: diagnostics.timeSinceLastSuccess,
      heartbeatAck: diagnostics.heartbeatAck,
      
      // Human readable status
      status: diagnostics.isConnected ? 'Connected' : 'Disconnected',
      healthStatus: connectionQuality === 'excellent' ? 'Healthy' : 
                   connectionQuality === 'good' ? 'Stable' :
                   connectionQuality === 'poor' ? 'Unstable' : 'Offline',
      
      // Timestamps
      timestamp: Date.now(),
      lastSuccessFormatted: diagnostics.lastSuccessfulConnection ? 
        new Date(diagnostics.lastSuccessfulConnection).toISOString() : null
    }
    
    return NextResponse.json(status)
    
  } catch (error) {
    console.error('Error getting Discord Gateway status:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      botConfigured: false,
      isConnected: false,
      status: 'Error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body
    
    if (action === 'reconnect') {
      // Force a reconnection
      console.log('Manual Discord Gateway reconnection requested')
      await discordGateway.reconnect()
      
      return NextResponse.json({ 
        success: true, 
        message: 'Reconnection initiated' 
      })
    }
    
    if (action === 'disconnect') {
      // Disconnect the gateway
      console.log('Manual Discord Gateway disconnection requested')
      discordGateway.disconnect()
      
      return NextResponse.json({ 
        success: true, 
        message: 'Gateway disconnected' 
      })
    }
    
    return NextResponse.json({ 
      error: 'Invalid action' 
    }, { status: 400 })
    
  } catch (error) {
    console.error('Error handling Discord Gateway action:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}