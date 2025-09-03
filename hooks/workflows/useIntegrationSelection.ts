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
  const [hasFetched, setHasFetched] = useState(false)
  
  // Fetch integrations once on mount
  useEffect(() => {
    if (!hasFetched && !loading) {
      console.log('Fetching integrations...')
      setHasFetched(true)
      fetchIntegrations()
    }
  }, [hasFetched, loading, fetchIntegrations])
  
  // Log when integrations are loaded
  useEffect(() => {
    if (storeIntegrations && storeIntegrations.length > 0) {
      console.log('Integrations loaded:', storeIntegrations.length, 'integrations')
      const connected = getConnectedProviders()
      console.log('Connected providers:', connected)
    }
  }, [storeIntegrations, getConnectedProviders])

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
    
    // Add other integrations from configs
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
    return Object.values(integrationMap).sort((a, b) => a.name.localeCompare(b.name))
  }, [])

  const availableIntegrations = useMemo(() => {
    const integrations = getIntegrationsFromNodes()
    return integrations
  }, [getIntegrationsFromNodes])

  const isIntegrationConnected = useCallback((integrationId: string): boolean => {
    if (integrationId === 'webhook' || integrationId === 'scheduler' || integrationId === 'ai') {
      return true
    }
    
    const connectedProviders = getConnectedProviders()
    
    // Direct provider match - this should work for most integrations
    const isConnected = connectedProviders.includes(integrationId)
    return isConnected
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
  ]), [])

  // Method to manually refresh integrations
  const refreshIntegrations = useCallback(() => {
    if (!loading) {
      console.log('Manual integration refresh triggered')
      fetchIntegrations()
    }
  }, [loading, fetchIntegrations])

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