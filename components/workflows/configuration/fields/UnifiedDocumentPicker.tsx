"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Combobox, MultiCombobox } from '@/components/ui/combobox'
import { useIntegrationStore } from '@/stores/integrationStore'
import { CheckCircle2, Link2, Plus, RefreshCw, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface UnifiedDocumentPickerProps {
  field: any
  value: any
  onChange: (value: any) => void
  error?: string
  onConnectProvider?: (providerId: string) => void
}

interface ProviderOption {
  id: string
  name: string
  logo: string
  color: string
}

// Define available providers for document selection
const DOCUMENT_PROVIDERS: Record<string, ProviderOption> = {
  google_docs: {
    id: 'google_docs',
    name: 'Google Docs',
    logo: '/integrations/google-drive.svg',
    color: '#4285F4'
  },
  notion: {
    id: 'notion',
    name: 'Notion',
    logo: '/integrations/notion.svg',
    color: '#000000'
  },
  onedrive: {
    id: 'onedrive',
    name: 'OneDrive',
    logo: '/integrations/onedrive.svg',
    color: '#0078D4'
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    logo: '/integrations/dropbox.svg',
    color: '#0061FF'
  },
  box: {
    id: 'box',
    name: 'Box',
    logo: '/integrations/box.svg',
    color: '#0061D5'
  }
}

export function UnifiedDocumentPicker({
  field,
  value,
  onChange,
  error,
  onConnectProvider
}: UnifiedDocumentPickerProps) {
  const { integrations, fetchIntegrations } = useIntegrationStore()
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [documents, setDocuments] = useState<any[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Get list of providers from field config
  const allowedProviders = useMemo(() => {
    if (!field.providers || field.providers.length === 0) {
      return Object.keys(DOCUMENT_PROVIDERS)
    }
    return field.providers
  }, [field.providers])

  // Filter providers to only show allowed ones
  const providerOptions = useMemo(() => {
    return allowedProviders
      .filter(id => DOCUMENT_PROVIDERS[id])
      .map(id => DOCUMENT_PROVIDERS[id])
  }, [allowedProviders])

  // Load integrations on mount
  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  // Check if a provider is connected
  const isProviderConnected = (providerId: string): boolean => {
    // Map UI provider IDs to database provider IDs
    const providerMapping: Record<string, string[]> = {
      google_docs: ['google-drive', 'google_drive', 'googledrive'],
      notion: ['notion'],
      onedrive: ['onedrive'],
      dropbox: ['dropbox'],
      box: ['box']
    }

    const checkIds = providerMapping[providerId] || [providerId]

    return integrations.some(integration => {
      const isMatching = checkIds.some(id =>
        integration.provider.toLowerCase() === id.toLowerCase()
      )
      const isConnected = integration.status === 'connected'
      return isMatching && isConnected
    })
  }

  // Load documents from the selected provider
  const loadDocuments = async (providerId: string, forceRefresh = false) => {
    setLoadingDocuments(true)
    try {
      // Map provider IDs to API endpoints
      const endpointMap: Record<string, string> = {
        google_docs: '/api/integrations/google-drive/documents',
        notion: '/api/integrations/notion/pages',
        onedrive: '/api/integrations/onedrive/documents',
        dropbox: '/api/integrations/dropbox/files',
        box: '/api/integrations/box/files'
      }

      const endpoint = endpointMap[providerId]
      if (!endpoint) {
        console.warn(`No endpoint defined for provider: ${providerId}`)
        setDocuments([])
        return
      }

      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`Failed to load documents: ${response.statusText}`)
      }

      const data = await response.json()

      // Normalize document structure across providers
      const normalizedDocs = (data.documents || data.pages || data.files || []).map((doc: any) => ({
        id: doc.id,
        name: doc.name || doc.title || 'Untitled',
        type: doc.type || 'document',
        url: doc.url || doc.webUrl || doc.web_url,
        provider: providerId
      }))

      setDocuments(normalizedDocs)
    } catch (error) {
      console.error('Error loading documents:', error)
      setDocuments([])
    } finally {
      setLoadingDocuments(false)
    }
  }

  // Handle provider selection
  const handleProviderSelect = async (providerId: string) => {
    setSelectedProvider(providerId)

    // If connected, load documents
    if (isProviderConnected(providerId)) {
      await loadDocuments(providerId)
    } else {
      setDocuments([])
    }
  }

  // Handle connect button click
  const handleConnect = async (providerId: string) => {
    if (onConnectProvider) {
      await onConnectProvider(providerId)
      // After connection, reload integrations and documents
      await fetchIntegrations()
      if (isProviderConnected(providerId)) {
        await loadDocuments(providerId)
      }
    } else {
      // Fallback: Open integration connection page in new tab
      // Map UI provider IDs to connection routes
      const routeMap: Record<string, string> = {
        google_docs: 'google-drive',
        notion: 'notion',
        onedrive: 'onedrive',
        dropbox: 'dropbox',
        box: 'box'
      }

      const route = routeMap[providerId] || providerId
      window.open(`/integrations?connect=${route}`, '_blank')
    }
  }

  // Handle document selection
  const handleDocumentSelect = (selectedValue: any) => {
    if (field.multiSelect) {
      // Multi-select mode
      onChange(selectedValue)
    } else {
      // Single-select mode
      onChange(selectedValue)
    }
  }

  // Handle refresh
  const handleRefresh = async () => {
    if (selectedProvider && isProviderConnected(selectedProvider)) {
      setIsRefreshing(true)
      await loadDocuments(selectedProvider, true)
      setIsRefreshing(false)
    }
  }

  // Handle create new document
  const handleCreateNew = async () => {
    if (!selectedProvider) return

    // TODO: Implement create new document flow
    // This would open a modal to create a new document in the selected provider
    console.log('Create new document in:', selectedProvider)
  }

  // Convert documents to combobox options
  const documentOptions = useMemo(() => {
    return documents.map(doc => ({
      value: JSON.stringify({ id: doc.id, name: doc.name, provider: selectedProvider, url: doc.url }),
      label: doc.name
    }))
  }, [documents, selectedProvider])

  // Get selected documents for display
  const selectedDocuments = useMemo(() => {
    if (!value) return field.multiSelect ? [] : ''

    if (field.multiSelect) {
      return Array.isArray(value) ? value : []
    } else {
      return value
    }
  }, [value, field.multiSelect])

  // Parse selected values for display
  const getDisplayValue = () => {
    if (!selectedDocuments) return field.multiSelect ? [] : ''

    if (field.multiSelect) {
      return selectedDocuments.map((doc: any) => {
        if (typeof doc === 'string') {
          try {
            const parsed = JSON.parse(doc)
            return parsed.id || doc
          } catch {
            return doc
          }
        }
        return doc.id || doc
      })
    } else {
      if (typeof selectedDocuments === 'string') {
        try {
          const parsed = JSON.parse(selectedDocuments)
          return parsed.id || selectedDocuments
        } catch {
          return selectedDocuments
        }
      }
      return selectedDocuments.id || selectedDocuments
    }
  }

  return (
    <Card className={cn("transition-all duration-200", error && "border-red-500")}>
      <CardContent className="p-4 space-y-4">
        {/* Provider Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Select Provider</Label>
          <div className="flex gap-2 flex-wrap">
            {providerOptions.map(provider => {
              const connected = isProviderConnected(provider.id)
              const selected = selectedProvider === provider.id

              return (
                <TooltipProvider key={provider.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleProviderSelect(provider.id)}
                        className={cn(
                          "flex items-center gap-2 relative",
                          selected && "ring-2 ring-offset-2 ring-primary"
                        )}
                      >
                        <img
                          src={provider.logo}
                          alt={provider.name}
                          className="w-4 h-4 object-contain"
                          onError={(e) => e.currentTarget.style.display = 'none'}
                        />
                        <span>{provider.name}</span>
                        {connected ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        ) : (
                          <XCircle className="w-3 h-3 text-muted-foreground" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{connected ? 'Connected' : 'Not connected'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            })}
          </div>
        </div>

        {/* Connection Status & Actions */}
        {selectedProvider && (
          <div className="space-y-3">
            {!isProviderConnected(selectedProvider) ? (
              // Not Connected - Show connect button
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <XCircle className="w-4 h-4 text-orange-500" />
                <span className="text-sm flex-1">
                  {DOCUMENT_PROVIDERS[selectedProvider].name} is not connected
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleConnect(selectedProvider)}
                  className="gap-2"
                >
                  <Link2 className="w-4 h-4" />
                  Connect
                </Button>
              </div>
            ) : (
              // Connected - Show document picker
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {field.multiSelect ? 'Select Documents' : 'Select Document'}
                  </Label>
                  <div className="flex gap-2">
                    {field.allowCreate && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={handleCreateNew}
                              className="h-8 w-8"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{field.createLabel || 'Create new document'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleRefresh}
                            disabled={isRefreshing || loadingDocuments}
                            className="h-8 w-8"
                          >
                            <RefreshCw className={cn(
                              "w-4 h-4",
                              (isRefreshing || loadingDocuments) && "animate-spin"
                            )} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Refresh documents</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {field.multiSelect ? (
                  <MultiCombobox
                    options={documentOptions}
                    value={getDisplayValue()}
                    onChange={handleDocumentSelect}
                    placeholder={
                      loadingDocuments
                        ? 'Loading documents...'
                        : field.placeholder || 'Select documents...'
                    }
                    disabled={loadingDocuments}
                  />
                ) : (
                  <Combobox
                    options={documentOptions}
                    value={getDisplayValue()}
                    onChange={handleDocumentSelect}
                    placeholder={
                      loadingDocuments
                        ? 'Loading documents...'
                        : field.placeholder || 'Select document...'
                    }
                    searchPlaceholder="Search documents..."
                    emptyPlaceholder={loadingDocuments ? "Loading..." : "No documents found"}
                    disabled={loadingDocuments}
                  />
                )}

                {field.help && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {field.help}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {!selectedProvider && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Select a provider to continue</p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
