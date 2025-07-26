import { NextRequest, NextResponse } from "next/server"
import { getOAuthConfig } from "@/lib/integrations/oauthConfig"

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
    
    return NextResponse.json({
      success: true,
      debug: {
        hasTeamsClientId,
        hasTeamsClientSecret,
        teamsClientId,
        formattedScopes,
        scopeString,
        scopeStringLength: scopeString.length,
        numberOfScopes: formattedScopes.length
      }
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
} 