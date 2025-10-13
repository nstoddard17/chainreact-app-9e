import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { FileStorageService } from '@/lib/storage/fileStorage'

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    // Verify that this is being called by a cron job or authorized source
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse('Unauthorized' , 401)
    }

    logger.debug('Starting cleanup of expired workflow files...')
    
    const cleanedCount = await FileStorageService.cleanupExpiredFiles()
    
    logger.debug(`Cleanup completed. Removed ${cleanedCount} expired files.`)
    
    return jsonResponse({
      success: true,
      message: `Cleaned up ${cleanedCount} expired files`,
      cleanedCount
    })

  } catch (error: any) {
    logger.error('File cleanup error:', error)
    return errorResponse('Failed to cleanup files', 500, { details: error.message  })
  }
}

export async function POST(request: NextRequest) {
  // Allow POST requests as well for manual triggers
  return GET(request)
} 