import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { getOAuthConfig } from "@/lib/integrations/oauthConfig"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

export async function GET(request: NextRequest) {
  try {
    // Get Teams OAuth config
    const config = getOAuthConfig("teams")
    if (!config) throw new Error("Teams OAuth config not found")
    
    // Get scope from config (same as other Microsoft services)
    const scopeString = config.scope || ""
    const formattedScopes = scopeString.split(" ")
    
    // Check environment variables
    const hasTeamsClientId = !!process.env.TEAMS_CLIENT_ID
    const hasTeamsClientSecret = !!process.env.TEAMS_CLIENT_SECRET
    const teamsClientId = process.env.TEAMS_CLIENT_ID ? `${process.env.TEAMS_CLIENT_ID.substring(0, 10)}...` : 'NOT SET'
    
    // Check user authentication and role
    let authInfo = null
    try {
      const supabase = await createSupabaseRouteHandlerClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (user && !userError) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        
        authInfo = {
          authenticated: true,
          userId: user.id,
          userRole: profile?.role || 'free',
          hasTeamsAccess: ['business', 'enterprise', 'admin'].includes(profile?.role || 'free')
        }
      } else {
        authInfo = {
          authenticated: false,
          error: userError?.message || 'No user found'
        }
      }
    } catch (authError) {
      authInfo = {
        authenticated: false,
        error: authError instanceof Error ? authError.message : 'Authentication check failed'
      }
    }
    
    return jsonResponse({
      success: true,
      debug: {
        hasTeamsClientId,
        hasTeamsClientSecret,
        teamsClientId,
        formattedScopes,
        scopeString,
        scopeStringLength: scopeString.length,
        numberOfScopes: formattedScopes.length,
        authInfo
      }
    })
  } catch (error: any) {
    return jsonResponse({
      success: false,
      error: error.message
    }, { status: 500 })
  }
} 