import { NextRequest, NextResponse } from "next/server"
import { getAllScopes } from "@/lib/integrations/integrationScopes"

export async function GET(request: NextRequest) {
  try {
    // Get Teams scopes
    const teamsScopes = getAllScopes("teams")
    
    // Format scopes for Microsoft Graph API
    const formattedScopes = [
      "offline_access", 
      "openid", 
      "profile", 
      "email"
    ];
    
    // Add Microsoft Graph API scopes with proper prefix
    teamsScopes.forEach(scope => {
      formattedScopes.push(`https://graph.microsoft.com/${scope}`);
    });
    
    const scopeString = formattedScopes.join(" ")
    
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
        teamsScopes,
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