/**
 * OneNote Pages Handler
 */

import { OneNoteIntegration, OneNotePage, OneNoteDataHandler, OneNoteApiResponse } from '../types'
import { validateOneNoteIntegration, validateOneNoteToken, tryMultipleOneNoteEndpoints } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getOneNotePages: OneNoteDataHandler<OneNotePage> = async (integration: OneNoteIntegration, options: any = {}): Promise<OneNoteApiResponse<OneNotePage>> => {
  logger.debug(`🔍 OneNote pages fetcher called with:`, {
    integrationId: integration.id,
    provider: integration.provider,
    status: integration.status,
    options
  })
  
  try {
    // Validate integration status
    validateOneNoteIntegration(integration)
    
    logger.debug(`🔍 Validating OneNote token...`)
    const tokenResult = await validateOneNoteToken(integration)
    logger.debug(`🔍 Token validation result:`, {
      success: tokenResult.success,
      hasToken: !!tokenResult.token,
      tokenLength: tokenResult.token?.length || 0,
      tokenPreview: tokenResult.token ? `${tokenResult.token.substring(0, 20)}...` : 'none',
      error: tokenResult.error
    })
    
    if (!tokenResult.success) {
      logger.debug(`❌ OneNote token validation failed: ${tokenResult.error}`)
      return {
        data: [],
        error: {
          message: tokenResult.error || "Authentication failed"
        }
      }
    }
    
    // Build endpoints based on whether we're filtering by section
    const sectionId = options?.sectionId
    let endpoints: string[]
    
    if (sectionId) {
      // Get pages for a specific section
      endpoints = [
        `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages?$select=id,title,lastModifiedDateTime&$top=100`,
        `https://graph.microsoft.com/beta/me/onenote/sections/${sectionId}/pages?$select=id,title`,
        `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`,
      ]
    } else {
      // Get all pages
      endpoints = [
        // All pages with content details
        'https://graph.microsoft.com/v1.0/me/onenote/pages?$select=id,title,contentUrl,lastModifiedDateTime,parentSection&$top=100',
        // Beta API with expanded section info
        'https://graph.microsoft.com/beta/me/onenote/pages?$expand=parentSection',
        // Standard API with basic selection
        'https://graph.microsoft.com/v1.0/me/onenote/pages?$select=id,title,createdDateTime',
        // Simple top 10 results
        'https://graph.microsoft.com/v1.0/me/onenote/pages?$top=10',
        // Ordered by last modified
        'https://graph.microsoft.com/v1.0/me/onenote/pages?$orderby=lastModifiedDateTime desc',
        // Ordered by title
        'https://graph.microsoft.com/v1.0/me/onenote/pages?$orderby=title',
        // Beta API with basic selection
        'https://graph.microsoft.com/beta/me/onenote/pages?$select=id,title'
      ]
    }
    
    const result = await tryMultipleOneNoteEndpoints<OneNotePage>(
      tokenResult.token!,
      endpoints,
      'pages'
    )
    
    if (result.data.length > 0) {
      logger.debug(`🔍 OneNote pages from API:`, result.data.map((page: any) => ({
        id: page.id,
        title: page.title,
        contentUrl: page.contentUrl,
        webUrl: page.webUrl,
        lastModifiedDateTime: page.lastModifiedDateTime,
        parentSection: page.parentSection
      })))
    }
    
    return result
  } catch (error: any) {
    logger.error("Error fetching OneNote pages:", error)
    
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
        message: error.message || "Error fetching OneNote pages"
      }
    }
  }
}