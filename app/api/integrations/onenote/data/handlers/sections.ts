/**
 * OneNote Sections Handler
 */

import { OneNoteIntegration, OneNoteSection, OneNoteDataHandler, OneNoteApiResponse } from '../types'
import { validateOneNoteIntegration, validateOneNoteToken, tryMultipleOneNoteEndpoints } from '../utils'

export const getOneNoteSections: OneNoteDataHandler<OneNoteSection> = async (integration: OneNoteIntegration, options: any = {}): Promise<OneNoteApiResponse<OneNoteSection>> => {
  console.log(`🔍 OneNote sections fetcher called with:`, {
    integrationId: integration.id,
    provider: integration.provider,
    status: integration.status,
    options
  })
  
  try {
    // Validate integration status
    validateOneNoteIntegration(integration)
    
    console.log(`🔍 Validating OneNote token...`)
    const tokenResult = await validateOneNoteToken(integration)
    console.log(`🔍 Token validation result:`, {
      success: tokenResult.success,
      hasToken: !!tokenResult.token,
      tokenLength: tokenResult.token?.length || 0,
      tokenPreview: tokenResult.token ? `${tokenResult.token.substring(0, 20)}...` : 'none',
      error: tokenResult.error
    })
    
    if (!tokenResult.success) {
      console.log(`❌ OneNote token validation failed: ${tokenResult.error}`)
      return {
        data: [],
        error: {
          message: tokenResult.error || "Authentication failed"
        }
      }
    }
    
    // Try multiple OneNote API endpoints for sections
    const endpoints = [
      // All sections with expanded pages
      'https://graph.microsoft.com/v1.0/me/onenote/sections?$expand=pages&$top=100',
      // Beta API with expanded pages
      'https://graph.microsoft.com/beta/me/onenote/sections?$expand=pages',
      // Standard API with basic selection
      'https://graph.microsoft.com/v1.0/me/onenote/sections?$select=id,displayName,createdDateTime',
      // Simple top 10 results
      'https://graph.microsoft.com/v1.0/me/onenote/sections?$top=10',
      // Ordered by display name
      'https://graph.microsoft.com/v1.0/me/onenote/sections?$orderby=displayName',
      // Beta API with basic selection
      'https://graph.microsoft.com/beta/me/onenote/sections?$select=id,displayName'
    ]
    
    const result = await tryMultipleOneNoteEndpoints<OneNoteSection>(
      tokenResult.token!,
      endpoints,
      'sections'
    )
    
    if (result.data.length > 0) {
      console.log(`🔍 OneNote sections from API:`, result.data.map((section: any) => ({
        id: section.id,
        displayName: section.displayName,
        name: section.name,
        lastModifiedDateTime: section.lastModifiedDateTime,
        webUrl: section.webUrl,
        parentNotebook: section.parentNotebook,
        pageCount: section.pages?.length || 0
      })))
    }
    
    return result
  } catch (error: any) {
    console.error("Error fetching OneNote sections:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return {
        data: [],
        error: {
          message: 'Microsoft authentication expired. Please reconnect your account.'
        }
      }
    }
    
    if (error.message?.includes('rate limit')) {
      return {
        data: [],
        error: {
          message: 'Microsoft Graph API rate limit exceeded. Please try again later.'
        }
      }
    }
    
    return {
      data: [],
      error: {
        message: error.message || "Error fetching OneNote sections"
      }
    }
  }
}