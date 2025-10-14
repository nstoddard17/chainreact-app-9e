import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types'

import { logger } from '@/lib/utils/logger'

export const onenoteOptionsLoader: ProviderOptionsLoader = {
  canHandle(fieldName: string, providerId: string): boolean {
    // Handle microsoft-onenote and onenote provider IDs
    if (providerId !== 'microsoft-onenote' && providerId !== 'onenote') {
      return false
    }
    
    // List of fields this loader can handle
    const supportedFields = [
      'notebookId', 'targetNotebookId', 'sourceNotebookId',
      'sectionId', 'targetSectionId', 'sourceSectionId',
      'pageId', 'sourcePageId'
    ]
    
    return supportedFields.includes(fieldName)
  },
  
  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, dependsOnValue } = params
    
    logger.debug('[OneNote Options Loader] Loading options for field:', fieldName, 'with params:', params)
    
    if (!integrationId) {
      logger.debug('[OneNote Options Loader] No integration ID provided')
      return []
    }
    
    switch (fieldName) {
      case 'notebookId':
      case 'targetNotebookId':
      case 'sourceNotebookId':
        return loadNotebooks(integrationId)
        
      case 'sectionId':
      case 'targetSectionId':
      case 'sourceSectionId': {
        const notebookId = dependsOnValue
        if (!notebookId) {
          logger.debug('[OneNote Options Loader] No notebook selected for sections')
          return []
        }
        return loadSections(integrationId, notebookId)
      }
        
      case 'pageId':
      case 'sourcePageId': {
        const sectionId = dependsOnValue
        if (!sectionId) {
          logger.debug('[OneNote Options Loader] No section selected for pages')
          return []
        }
        return loadPages(integrationId, sectionId)
      }
        
      default:
        logger.debug('[OneNote Options Loader] Unknown field:', fieldName)
        return []
    }
  },
  
  getFieldDependencies(fieldName: string): string[] {
    const dependencyMap: Record<string, string[]> = {
      notebookId: ['sectionId'],
      sectionId: ['pageId'],
      sourceNotebookId: ['sourceSectionId'],
      sourceSectionId: ['sourcePageId'],
      targetNotebookId: ['targetSectionId'],
    }
    
    return dependencyMap[fieldName] || []
  }
}

async function loadNotebooks(integrationId: string) {
  try {
    logger.debug('[OneNote Options Loader] Loading notebooks for integration:', integrationId)
    
    const response = await fetch('/api/integrations/onenote/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        integrationId,
        dataType: 'onenote_notebooks'
      })
    })
    
    const result = await response.json()
    
    if (!response.ok) {
      logger.error('[OneNote Options Loader] API error:', response.status, response.statusText)
      
      // Check if it's an authentication error
      if (response.status === 401 || result.needsReconnection) {
        logger.debug('[OneNote Options Loader] Authentication error - token may be expired')
        // Return a special option to indicate reconnection is needed
        return [{
          value: '__reconnect__',
          label: '⚠️ Microsoft authentication expired - Please reconnect',
          icon: '🔄',
          disabled: true
        }]
      }
      return []
    }
    
    // Check for personal account warning
    if (result.knownLimitation && result.accountType === 'personal') {
      logger.warn('[OneNote Options Loader] Personal account detected with known limitations')
      return [{
        value: '__personal_account__',
        label: '⚠️ Personal Microsoft accounts not supported',
        icon: '❌',
        disabled: true
      }, {
        value: '__use_work_account__',
        label: 'Please use a work or school account for OneNote',
        icon: 'ℹ️',
        disabled: true
      }]
    }
    
    if (!result.data || !Array.isArray(result.data)) {
      logger.debug('[OneNote Options Loader] No notebooks data received')
      if (result.error) {
        logger.debug('[OneNote Options Loader] Error message:', result.error)
        // Check if the error indicates authentication issues
        if (result.error.includes('authentication') || result.error.includes('expired')) {
          return [{
            value: '__reconnect__',
            label: '⚠️ Please reconnect your Microsoft account',
            icon: '🔄',
            disabled: true
          }]
        }
      }
      return []
    }
    
    // Map the notebooks to the format expected by the combobox
    const options = result.data.map((notebook: any) => ({
      value: notebook.id,
      label: notebook.displayName || notebook.name || 'Untitled Notebook',
      icon: '📓'
    }))
    
    logger.debug('[OneNote Options Loader] Loaded notebooks:', options.length)
    
    // If no notebooks found, provide a helpful message
    if (options.length === 0) {
      return [{
        value: '__empty__',
        label: 'No notebooks found - Create one in OneNote first',
        icon: '📓',
        disabled: true
      }]
    }
    
    return options
  } catch (error) {
    logger.error('[OneNote Options Loader] Error loading notebooks:', error)
    return []
  }
}

async function loadSections(integrationId: string, notebookId: string) {
  try {
    logger.debug('[OneNote Options Loader] Loading sections for notebook:', notebookId)
    
    const response = await fetch('/api/integrations/onenote/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        integrationId,
        dataType: 'onenote_sections',
        options: { notebookId }
      })
    })
    
    const result = await response.json()
    
    if (!response.ok) {
      logger.error('[OneNote Options Loader] API error:', response.status, response.statusText)
      return []
    }
    
    // Check for personal account warning
    if (result.knownLimitation && result.accountType === 'personal') {
      logger.warn('[OneNote Options Loader] Personal account detected - sections not available')
      return [{
        value: '__personal_account__',
        label: '⚠️ Personal accounts cannot access sections',
        icon: '❌',
        disabled: true
      }]
    }
    
    if (!result.data || !Array.isArray(result.data)) {
      logger.debug('[OneNote Options Loader] No sections data received')
      return []
    }
    
    // Map the sections to the format expected by the combobox
    const options = result.data.map((section: any) => ({
      value: section.id,
      label: section.displayName || section.name || 'Untitled Section',
      icon: '📁'
    }))
    
    logger.debug('[OneNote Options Loader] Loaded sections:', options.length)
    return options
  } catch (error) {
    logger.error('[OneNote Options Loader] Error loading sections:', error)
    return []
  }
}

async function loadPages(integrationId: string, sectionId: string) {
  try {
    logger.debug('[OneNote Options Loader] Loading pages for section:', sectionId)
    
    const response = await fetch('/api/integrations/onenote/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        integrationId,
        dataType: 'onenote_pages',
        options: { sectionId }
      })
    })
    
    const result = await response.json()
    
    if (!response.ok) {
      logger.error('[OneNote Options Loader] API error:', response.status, response.statusText)
      return []
    }
    
    // Check for personal account warning
    if (result.knownLimitation && result.accountType === 'personal') {
      logger.warn('[OneNote Options Loader] Personal account detected - pages not available')
      return [{
        value: '__personal_account__',
        label: '⚠️ Personal accounts cannot access pages',
        icon: '❌',
        disabled: true
      }]
    }
    
    if (!result.data || !Array.isArray(result.data)) {
      logger.debug('[OneNote Options Loader] No pages data received')
      return []
    }
    
    // Map the pages to the format expected by the combobox
    const options = result.data.map((page: any) => ({
      value: page.id,
      label: page.title || 'Untitled Page',
      icon: '📄',
      description: page.lastModifiedDateTime ? 
        `Modified: ${new Date(page.lastModifiedDateTime).toLocaleDateString()}` : 
        undefined
    }))
    
    logger.debug('[OneNote Options Loader] Loaded pages:', options.length)
    return options
  } catch (error) {
    logger.error('[OneNote Options Loader] Error loading pages:', error)
    return []
  }
}