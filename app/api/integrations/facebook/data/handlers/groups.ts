/**
 * Facebook Groups Handler
 */

import { FacebookIntegration, FacebookDataHandler } from '../types'
import { makeFacebookApiRequest, validateFacebookToken } from '../utils'

interface FacebookGroup {
  id: string
  name: string
  value: string
  member_count?: number
  privacy?: string
  description?: string
}

export const getFacebookGroups: FacebookDataHandler<FacebookGroup> = async (integration: FacebookIntegration, options: any = {}) => {
  try {
    console.log("🔍 Facebook groups fetcher called with:", {
      integrationId: integration.id,
      hasToken: !!integration.access_token
    })
    
    // Validate and get token
    const tokenResult = await validateFacebookToken(integration)
    
    if (!tokenResult.success) {
      console.log(`❌ Facebook token validation failed: ${tokenResult.error}`)
      return []
    }

    // Facebook API endpoint for groups the user is a member of
    // Note: As of API v19.0, the /me/groups endpoint requires special permissions
    // that are not available to most apps. We'll return a helpful message instead.
    console.log("🔍 Attempting to fetch Facebook groups")
    
    try {
      const response = await makeFacebookApiRequest(
        'https://graph.facebook.com/v19.0/me/groups?fields=id,name,member_count,privacy,description',
        tokenResult.token!
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error(`Facebook API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
        
        // Return empty array on error - let the UI handle empty state
        return []
      }

      const data = await response.json()
      console.log("🔍 Facebook groups API response:", {
        hasData: !!data.data,
        groupCount: data.data?.length || 0,
        sample: data.data?.[0]
      })
      
      // If we get groups, return them
      if (data.data && data.data.length > 0) {
        const groups = data.data.map((group: any) => ({
          id: group.id,
          name: group.name || `Group ${group.id}`,
          member_count: group.member_count,
          privacy: group.privacy,
          description: group.description
        }))
        
        console.log(`✅ Processed ${groups.length} Facebook groups:`, groups)
        return groups
      }
      
      // If no groups, return empty array
      return []
      
    } catch (apiError: any) {
      console.error("Error calling Facebook groups API:", apiError)
      // Return empty array on error
      return []
    }
  } catch (error: any) {
    console.error("Error fetching Facebook groups:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Facebook authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Facebook API rate limit exceeded. Please try again later.')
    }
    
    // Return empty array instead of throwing to prevent breaking the UI
    console.warn("Returning empty array to prevent UI breakage")
    return []
  }
}