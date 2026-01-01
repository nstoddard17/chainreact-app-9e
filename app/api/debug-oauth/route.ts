import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@/utils/supabaseClient'

/**
 * Debug OAuth endpoint - PROTECTED
 * Only accessible by admin users in development environment
 */
export async function GET(request: NextRequest) {
  // SECURITY: Block in production unless admin
  const isProduction = process.env.NODE_ENV === 'production'

  // Get authenticated user
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return errorResponse('Authentication required', 401)
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.is_admin === true

  // In production, only admins can access
  if (isProduction && !isAdmin) {
    return errorResponse('Admin access required', 403)
  }

  // In development, allow access but still require authentication
  const debugInfo = {
    // Only show if admin, otherwise show status only
    GOOGLE_CLIENT_ID: isAdmin
      ? (process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.substring(0, 10)}...` : 'NOT SET')
      : (process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET'),
    GOOGLE_CLIENT_SECRET: isAdmin
      ? (process.env.GOOGLE_CLIENT_SECRET ? `${process.env.GOOGLE_CLIENT_SECRET.substring(0, 4)}***` : 'NOT SET')
      : (process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET'),
    AIRTABLE_CLIENT_ID: isAdmin
      ? (process.env.AIRTABLE_CLIENT_ID ? `${process.env.AIRTABLE_CLIENT_ID.substring(0, 10)}...` : 'NOT SET')
      : (process.env.AIRTABLE_CLIENT_ID ? 'SET' : 'NOT SET'),

    // Environment info (safe to show)
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,

    // Access info
    accessedBy: user.email,
    isAdmin,
    timestamp: new Date().toISOString()
  }

  return jsonResponse(debugInfo)
} 