import React, { useMemo, useCallback, useEffect, useState } from 'react'
import { ALL_NODE_COMPONENTS, NodeComponent } from '@/lib/workflows/nodes'
import { INTEGRATION_CONFIGS } from '@/lib/integrations/availableIntegrations'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useIntegrationsStore } from '@/stores/integrationCacheStore'

interface IntegrationInfo {
  id: string
  name: string
  description: string
  category: string
  color: string
  triggers: NodeComponent[]
  actions: NodeComponent[]
}

export function useIntegrationSelection() {
  const { getConnectedProviders, fetchIntegrations, integrations: storeIntegrations, loading } = useIntegrationStore()
  const { data: integrations } = useIntegrationsStore()
  
  // Fetch integrations once on mount - always fetch if store is empty
  useEffect(() => {
    if (!loading && (!storeIntegrations || storeIntegrations.length === 0)) {
      fetchIntegrations(true) // Force fetch to ensure fresh data
    }
  }, [loading, storeIntegrations, fetchIntegrations])

  const getIntegrationsFromNodes = useCallback((): IntegrationInfo[] => {
    const integrationMap: Record<string, IntegrationInfo> = {}
    
    // Add AI Agent as a separate integration first
    integrationMap['ai'] = {
      id: 'ai',
      name: 'AI Agent',
      description: 'Intelligent automation with AI-powered decision making and task execution',
      category: 'ai',
      color: '#8B5CF6',
      triggers: [],
      actions: [],
    }
    
    // Add Core integration for system triggers
    integrationMap['core'] = {
      id: 'core',
      name: 'Core',
      description: 'System-level triggers and actions',
      category: 'system',
      color: '#6B7280',
      triggers: [],
      actions: [],
    }
    
    // Add Logic & Control integration
    integrationMap['logic'] = {
      id: 'logic',
      name: 'Logic & Control',
      description: 'Control flow and logic operations',
      category: 'system',
      color: '#6B7280',
      triggers: [],
      actions: [],
    }
    
    // Add ALL integrations from configs, including those without nodes (Coming Soon)
    for (const integrationId in INTEGRATION_CONFIGS) {
      const config = INTEGRATION_CONFIGS[integrationId]
      if (config) {
        integrationMap[integrationId] = {
          id: config.id,
          name: config.name,
          description: config.description,
          category: config.category,
          color: config.color,
          triggers: [],
          actions: [],
        }
      }
    }
    
    // Also add any missing "coming soon" integrations that might not be in INTEGRATION_CONFIGS
    const additionalComingSoonIntegrations = [
      { id: 'beehiiv', name: 'beehiiv', description: 'Newsletter platform for creators', category: 'marketing', color: '#000000' },
      { id: 'kit', name: 'Kit', description: 'Email marketing for creators', category: 'marketing', color: '#000000' },
    ]
    
    additionalComingSoonIntegrations.forEach(integration => {
      if (!integrationMap[integration.id]) {
        integrationMap[integration.id] = {
          ...integration,
          triggers: [],
          actions: [],
        }
      }
    })
    
    // Process all node components
    ALL_NODE_COMPONENTS.forEach(node => {
      const providerId = node.providerId || node.integration
      
      if (providerId === 'ai') {
        if (node.type === 'ai_agent') {
          integrationMap['ai'].actions.push(node)
        }
      } else if (providerId && integrationMap[providerId]) {
        if (node.isTrigger) {
          integrationMap[providerId].triggers.push(node)
        } else {
          integrationMap[providerId].actions.push(node)
        }
      }
    })
    
    // Sort integrations alphabetically by name
    const result = Object.values(integrationMap).sort((a, b) => a.name.localeCompare(b.name))
    return result
  }, [])

  const availableIntegrations = useMemo(() => {
    const integrations = getIntegrationsFromNodes()
    return integrations
  }, [getIntegrationsFromNodes])

  const isIntegrationConnected = useCallback((integrationId: string): boolean => {
    // Special integrations that don't require connection
    if (['webhook', 'scheduler', 'ai', 'core', 'logic', 'manual'].includes(integrationId)) {
      return true
    }
    
    const connectedProviders = getConnectedProviders()
    
    // Check if there's a base 'google' integration that covers all Google services
    if (integrationId.startsWith('google-') || integrationId === 'gmail') {
      // Check for either the specific service or the base google provider
      const hasSpecific = connectedProviders.includes(integrationId)
      const hasBase = connectedProviders.includes('google')
      return hasSpecific || hasBase
    }
    
    // Check for Microsoft services
    if (integrationId.startsWith('microsoft-') || integrationId === 'onedrive') {
      const hasSpecific = connectedProviders.includes(integrationId)
      const hasBase = connectedProviders.includes('microsoft')
      return hasSpecific || hasBase
    }
    
    // Direct provider match
    return connectedProviders.includes(integrationId)
  }, [getConnectedProviders])

  const filterIntegrations = useCallback((
    integrations: IntegrationInfo[],
    searchQuery: string,
    filterCategory: string,
    showConnectedOnly: boolean
  ) => {
    return integrations.filter(integration => {
      const searchMatch = !searchQuery || 
        integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        integration.description.toLowerCase().includes(searchQuery.toLowerCase())
      
      const categoryMatch = filterCategory === 'all' || integration.category === filterCategory
      
      const connectionMatch = !showConnectedOnly || isIntegrationConnected(integration.id)
      
      return searchMatch && categoryMatch && connectionMatch
    })
  }, [isIntegrationConnected])

  const getDisplayedTriggers = useCallback((
    selectedIntegration: IntegrationInfo | null,
    searchQuery: string
  ) => {
    if (!selectedIntegration) return []
    
    return selectedIntegration.triggers.filter(trigger =>
      !searchQuery || 
      trigger.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (trigger.description && trigger.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }, [])

  const getDisplayedActions = useCallback((
    selectedIntegration: IntegrationInfo | null,
    searchQuery: string
  ) => {
    if (!selectedIntegration) return []
    
    return selectedIntegration.actions.filter(action =>
      !searchQuery || 
      action.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (action.description && action.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }, [])

  const renderLogo = useCallback((integrationId: string, name?: string) => {
    // Return an img element pointing to the SVG file
    return React.createElement('img', {
      src: `/integrations/${integrationId}.svg`,
      alt: `${name || integrationId} logo`,
      className: 'w-8 h-8 object-contain',
      onError: (e: any) => {
        // Hide the image if it fails to load
        e.currentTarget.style.display = 'none'
      }
    })
  }, [])

  const categories = useMemo(() => {
    const allCategories = availableIntegrations.map(int => int.category)
    return ['all', ...Array.from(new Set(allCategories))]
  }, [availableIntegrations])

  const comingSoonIntegrations = useMemo(() => new Set([
    'beehiiv',
    'manychat',
    'gumroad',
    'kit',
    'paypal',
    'shopify',
    'blackbaud',
    'box',
    'dropbox',
    'github',
    'gitlab',
    'instagram',
    'linkedin',
    'teams',  // Microsoft Teams uses 'teams' as its ID
    'stripe',
    'tiktok',
    'youtube',
    'youtube-studio',
  ]), [])

  // Method to manually refresh integrations
  const refreshIntegrations = useCallback(async () => {
    await fetchIntegrations(true) // Force refresh from server
  }, [fetchIntegrations])

  return {
    availableIntegrations,
    isIntegrationConnected,
    filterIntegrations,
    getDisplayedTriggers,
    getDisplayedActions,
    renderLogo,
    categories,
    comingSoonIntegrations,
    integrations,
    loadingIntegrations: loading,
    refreshIntegrations,
  }
}