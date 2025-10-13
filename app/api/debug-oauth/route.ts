import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

export async function GET(request: NextRequest) {
  const debugInfo = {
    // Server-side variables (should be available)
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 
      `${process.env.GOOGLE_CLIENT_ID.substring(0, 10)}...` : 'NOT SET',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 
      `${process.env.GOOGLE_CLIENT_SECRET.substring(0, 10)}...` : 'NOT SET',
    
    AIRTABLE_CLIENT_ID: process.env.AIRTABLE_CLIENT_ID ? 
      `${process.env.AIRTABLE_CLIENT_ID.substring(0, 10)}...` : 'NOT SET',
    
    // Environment info
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    
    // Timestamp
    timestamp: new Date().toISOString()
  }

  return jsonResponse(debugInfo)
} 