import { NextRequest, NextResponse } from 'next/server'
import { FileStorageService } from '@/lib/storage/fileStorage'

export async function GET(request: NextRequest) {
  try {
    // Verify that this is being called by a cron job or authorized source
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('Starting cleanup of expired workflow files...')
    
    const cleanedCount = await FileStorageService.cleanupExpiredFiles()
    
    console.log(`Cleanup completed. Removed ${cleanedCount} expired files.`)
    
    return NextResponse.json({
      success: true,
      message: `Cleaned up ${cleanedCount} expired files`,
      cleanedCount
    })

  } catch (error: any) {
    console.error('File cleanup error:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup files', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  // Allow POST requests as well for manual triggers
  return GET(request)
} 