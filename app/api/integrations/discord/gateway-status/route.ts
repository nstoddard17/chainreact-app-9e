import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { discordGateway } from '@/lib/integrations/discordGateway'
import { checkDiscordBotConfig } from '@/lib/utils/discordConfig'

import { logger } from '@/lib/utils/logger'

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
    
    return jsonResponse(status)
    
  } catch (error) {
    logger.error('Error getting Discord Gateway status:', error)
    return errorResponse('Internal server error', 500, {
      botConfigured: false,
      isConnected: false,
      status: 'Error'
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body
    
    if (action === 'reconnect') {
      // Force a reconnection
      logger.debug('Manual Discord Gateway reconnection requested')
      await discordGateway.reconnect()
      
      return jsonResponse({ 
        success: true, 
        message: 'Reconnection initiated' 
      })
    }
    
    if (action === 'disconnect') {
      // Disconnect the gateway
      logger.debug('Manual Discord Gateway disconnection requested')
      discordGateway.disconnect()
      
      return jsonResponse({ 
        success: true, 
        message: 'Gateway disconnected' 
      })
    }
    
    return errorResponse('Invalid action' 
    , 400)
    
  } catch (error) {
    logger.error('Error handling Discord Gateway action:', error)
    return errorResponse('Internal server error' 
    , 500)
  }
}