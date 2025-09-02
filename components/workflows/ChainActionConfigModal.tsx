"use client"

import React, { useState, useEffect } from 'react'
import { ConfigurationModal } from './configuration'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { INTEGRATION_CONFIGS } from '@/lib/integrations/availableIntegrations'
import { useToast } from '@/hooks/use-toast'
// Define ChainAction type locally
export interface ChainAction {
  id: string
  nodeType: string
  providerId: string
  config: Record<string, any>
  aiAutoConfig: boolean
}

interface ChainActionConfigModalProps {
  action: ChainAction | null
  isOpen: boolean
  onClose: () => void
  onSave: (actionId: string, config: Record<string, any>) => void
}

export function ChainActionConfigModal({
  action,
  isOpen,
  onClose,
  onSave
}: ChainActionConfigModalProps) {
  const { toast } = useToast()

  // Find the node component and integration config
  const nodeComponent = action ? ALL_NODE_COMPONENTS.find(n => n.type === action.nodeType) : null
  const integration = action ? INTEGRATION_CONFIGS[action.providerId as keyof typeof INTEGRATION_CONFIGS] : null

  const handleSave = async (newConfig: Record<string, any>) => {
    if (action) {
      onSave(action.id, newConfig)
      toast({
        title: "Action Configured",
        description: "Action settings have been saved"
      })
    }
  }

  if (!action || !nodeComponent || !integration) return null

  return (
    <ConfigurationModal
      isOpen={isOpen}
      onClose={onClose}
      onSave={handleSave}
      nodeInfo={nodeComponent}
      integrationName={integration.name || action.providerId}
      initialData={action.config || {}}
      currentNodeId={action.id}
    />
  )
}