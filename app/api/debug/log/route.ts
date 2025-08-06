import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Log to server console with timestamp
    const timestamp = new Date().toISOString()
    console.log(`🔍 [${timestamp}] DEBUG LOG:`, JSON.stringify(data, null, 2))
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in debug log endpoint:', error)
    return NextResponse.json({ success: false, error: 'Failed to log' }, { status: 500 })
  }
} 