import { ProviderOptionsLoader } from '../types'

export const onenoteOptionsLoader: ProviderOptionsLoader = {
  providerId: 'microsoft-onenote',
  
  loadFieldOptions: async (fieldName: string, integrationId: string, dependencies?: Record<string, any>) => {
    console.log('[OneNote Options Loader] Loading options for field:', fieldName, 'with dependencies:', dependencies)
    
    switch (fieldName) {
      case 'notebookId':
      case 'targetNotebookId':
      case 'sourceNotebookId':
        return loadNotebooks(integrationId)
        
      case 'sectionId':
      case 'targetSectionId':
      case 'sourceSectionId': {
        // Determine which notebook field to use based on the field name prefix
        let notebookFieldName = 'notebookId'
        if (fieldName.startsWith('target')) {
          notebookFieldName = 'targetNotebookId'
        } else if (fieldName.startsWith('source')) {
          notebookFieldName = 'sourceNotebookId'
        }
        
        const notebookId = dependencies?.[notebookFieldName]
        if (!notebookId) {
          console.log('[OneNote Options Loader] No notebook selected for sections')
          return []
        }
        return loadSections(integrationId, notebookId)
      }
        
      case 'pageId':
      case 'sourcePageId': {
        // Determine which section field to use based on the field name prefix
        let sectionFieldName = 'sectionId'
        if (fieldName.startsWith('source')) {
          sectionFieldName = 'sourceSectionId'
        }
        
        const sectionId = dependencies?.[sectionFieldName]
        if (!sectionId) {
          console.log('[OneNote Options Loader] No section selected for pages')
          return []
        }
        return loadPages(integrationId, sectionId)
      }
        
      default:
        console.log('[OneNote Options Loader] Unknown field:', fieldName)
        return []
    }
  },
  
  getDependentFields: (fieldName: string) => {
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
    console.log('[OneNote Options Loader] Loading notebooks for integration:', integrationId)
    
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
      console.error('[OneNote Options Loader] API error:', response.status, response.statusText)
      
      // Check if it's an authentication error
      if (response.status === 401 || result.needsReconnection) {
        console.log('[OneNote Options Loader] Authentication error - token may be expired')
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
    
    if (!result.data || !Array.isArray(result.data)) {
      console.log('[OneNote Options Loader] No notebooks data received')
      if (result.error) {
        console.log('[OneNote Options Loader] Error message:', result.error)
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
    
    console.log('[OneNote Options Loader] Loaded notebooks:', options.length)
    return options
  } catch (error) {
    console.error('[OneNote Options Loader] Error loading notebooks:', error)
    return []
  }
}

async function loadSections(integrationId: string, notebookId: string) {
  try {
    console.log('[OneNote Options Loader] Loading sections for notebook:', notebookId)
    
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
    
    if (!response.ok) {
      console.error('[OneNote Options Loader] API error:', response.status, response.statusText)
      return []
    }
    
    const result = await response.json()
    
    if (!result.data || !Array.isArray(result.data)) {
      console.log('[OneNote Options Loader] No sections data received')
      return []
    }
    
    // Map the sections to the format expected by the combobox
    const options = result.data.map((section: any) => ({
      value: section.id,
      label: section.displayName || section.name || 'Untitled Section',
      icon: '📁'
    }))
    
    console.log('[OneNote Options Loader] Loaded sections:', options.length)
    return options
  } catch (error) {
    console.error('[OneNote Options Loader] Error loading sections:', error)
    return []
  }
}

async function loadPages(integrationId: string, sectionId: string) {
  try {
    console.log('[OneNote Options Loader] Loading pages for section:', sectionId)
    
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
    
    if (!response.ok) {
      console.error('[OneNote Options Loader] API error:', response.status, response.statusText)
      return []
    }
    
    const result = await response.json()
    
    if (!result.data || !Array.isArray(result.data)) {
      console.log('[OneNote Options Loader] No pages data received')
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
    
    console.log('[OneNote Options Loader] Loaded pages:', options.length)
    return options
  } catch (error) {
    console.error('[OneNote Options Loader] Error loading pages:', error)
    return []
  }
}