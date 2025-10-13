import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json()
    
    if (!accessToken) {
      return jsonResponse({
        success: false,
        error: "No access token provided"
      }, { status: 400 })
    }

    // First, get user info to check account type
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    })

    if (!userResponse.ok) {
      return jsonResponse({
        success: false,
        error: "Failed to get user information"
      }, { status: 400 })
    }

    const userData = await userjsonResponse()
    
    // Check if this is a work/school account
    const isWorkAccount = userData.userPrincipalName && 
                         (userData.userPrincipalName.includes('@') && 
                          !userData.userPrincipalName.endsWith('@outlook.com') &&
                          !userData.userPrincipalName.endsWith('@hotmail.com') &&
                          !userData.userPrincipalName.endsWith('@live.com') &&
                          !userData.userPrincipalName.endsWith('@msn.com'))

    // Try to access Teams API to see if it's available
    const teamsResponse = await fetch("https://graph.microsoft.com/v1.0/me/joinedTeams", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    })

    const teamsData = await teamsjsonResponse()
    
    // Check for specific Teams API errors
    const hasTeamsAccess = teamsResponse.ok || 
                          (teamsData.error && teamsData.error.code === 'Forbidden' && 
                           teamsData.error.message.includes('Insufficient privileges'))

    if (!isWorkAccount) {
      return jsonResponse({
        success: false,
        error: "TEAMS_PERSONAL_ACCOUNT",
        message: "Microsoft Teams integration requires a work or school account with Microsoft 365 subscription. Personal Microsoft accounts (@outlook.com, @hotmail.com, etc.) are not supported.",
        userInfo: {
          displayName: userData.displayName,
          userPrincipalName: userData.userPrincipalName,
          accountType: "personal"
        }
      })
    }

    if (!hasTeamsAccess) {
      return jsonResponse({
        success: false,
        error: "TEAMS_NO_ACCESS",
        message: "Your work or school account does not have access to Microsoft Teams. Please contact your administrator to enable Teams access or ensure you have a Microsoft 365 subscription.",
        userInfo: {
          displayName: userData.displayName,
          userPrincipalName: userData.userPrincipalName,
          accountType: "work_school_no_teams"
        }
      })
    }

    return jsonResponse({
      success: true,
      message: "Account validated for Teams access",
      userInfo: {
        displayName: userData.displayName,
        userPrincipalName: userData.userPrincipalName,
        accountType: "work_school_with_teams"
      }
    })

  } catch (error: any) {
    logger.error("Teams account validation error:", error)
    return jsonResponse({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Failed to validate Teams account access"
    }, { status: 500 })
  }
} 