/**
 * OneNote Notebooks Handler
 */

import { OneNoteIntegration, OneNoteNotebook, OneNoteDataHandler, OneNoteApiResponse } from '../types'
import { validateOneNoteIntegration, validateOneNoteToken, tryMultipleOneNoteEndpoints } from '../utils'

export const getOneNoteNotebooks: OneNoteDataHandler<OneNoteNotebook> = async (integration: OneNoteIntegration, options: any = {}): Promise<OneNoteApiResponse<OneNoteNotebook>> => {
  console.log(`🔍 OneNote notebooks fetcher called with:`, {
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
    
    // Try multiple OneNote API endpoints for maximum compatibility
    const endpoints = [
      // Standard API with expanded sections
      'https://graph.microsoft.com/v1.0/me/onenote/notebooks?$expand=sections&$top=100',
      // Beta API with expanded sections
      'https://graph.microsoft.com/beta/me/onenote/notebooks?$expand=sections',
      // Standard API with basic selection
      'https://graph.microsoft.com/v1.0/me/onenote/notebooks?$select=id,displayName,createdDateTime',
      // Simple top 10 results
      'https://graph.microsoft.com/v1.0/me/onenote/notebooks?$top=10',
      // Ordered by display name
      'https://graph.microsoft.com/v1.0/me/onenote/notebooks?$orderby=displayName',
      // Beta API with basic selection
      'https://graph.microsoft.com/beta/me/onenote/notebooks?$select=id,displayName'
    ]
    
    const result = await tryMultipleOneNoteEndpoints<OneNoteNotebook>(
      tokenResult.token!,
      endpoints,
      'notebooks'
    )
    
    if (result.data.length > 0) {
      console.log(`🔍 OneNote notebooks from API:`, result.data.map((notebook: any) => ({
        id: notebook.id,
        displayName: notebook.displayName,
        name: notebook.name,
        lastModifiedDateTime: notebook.lastModifiedDateTime,
        webUrl: notebook.webUrl,
        isDefault: notebook.isDefault,
        userRole: notebook.userRole,
        isShared: notebook.isShared,
        sectionCount: notebook.sections?.length || 0,
        links: notebook.links
      })))
    }
    
    return result
  } catch (error: any) {
    console.error("Error fetching OneNote notebooks:", error)
    
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
        message: error.message || "Error fetching OneNote notebooks"
      }
    }
  }
}