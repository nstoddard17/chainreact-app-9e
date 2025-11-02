'use client'

import React, { useState, useEffect } from 'react'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { User, Users, Building2, Loader2 } from 'lucide-react'
import { logger } from '@/lib/utils/logger'

interface WorkspaceSwitcherProps {
  className?: string
}

export default function WorkspaceSwitcher({ className }: WorkspaceSwitcherProps) {
  const { workspaces, loading: workspacesLoading } = useWorkspaces()
  const { setWorkspaceContext, fetchWorkflows } = useWorkflowStore()
  const { fetchIntegrations } = useIntegrationStore()

  // Load from localStorage or default to personal
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedWorkspace') || 'personal:'
    }
    return 'personal:'
  })
  const [switching, setSwitching] = useState(false)

  // Get current workspace details for display
  const currentWorkspace = workspaces.find(ws => {
    const key = `${ws.type}:${ws.id || ''}`
    return key === selectedWorkspace
  })

  const handleWorkspaceChange = async (value: string) => {
    logger.debug('[WorkspaceSwitcher] Switching workspace to:', value)
    setSwitching(true)

    try {
      // Parse workspace type and id
      const [workspaceType, workspaceId] = value.split(':')

      // Update workspace context
      setWorkspaceContext(
        workspaceType as 'personal' | 'team' | 'organization',
        workspaceId || null
      )

      // Save to localStorage
      localStorage.setItem('selectedWorkspace', value)
      setSelectedWorkspace(value)

      // Refresh workflows and integrations for new workspace
      await Promise.all([
        fetchWorkflows(true), // Force refresh
        fetchIntegrations(true) // Force refresh
      ])

      logger.info('[WorkspaceSwitcher] Switched to workspace:', workspaceType, workspaceId)
    } catch (error: any) {
      logger.error('[WorkspaceSwitcher] Failed to switch workspace:', error)
    } finally {
      setSwitching(false)
    }
  }

  // Initialize workspace context on mount
  useEffect(() => {
    if (!workspacesLoading && selectedWorkspace) {
      const [workspaceType, workspaceId] = selectedWorkspace.split(':')
      setWorkspaceContext(
        workspaceType as 'personal' | 'team' | 'organization',
        workspaceId || null
      )
    }
  }, [workspacesLoading, selectedWorkspace])

  if (workspacesLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading workspaces...</span>
      </div>
    )
  }

  const getWorkspaceIcon = (type: 'personal' | 'team' | 'organization') => {
    switch (type) {
      case 'personal':
        return <User className="w-4 h-4" />
      case 'team':
        return <Users className="w-4 h-4" />
      case 'organization':
        return <Building2 className="w-4 h-4" />
    }
  }

  return (
    <div className={className}>
      <Select value={selectedWorkspace} onValueChange={handleWorkspaceChange} disabled={switching}>
        <SelectTrigger className="w-full">
          <div className="flex items-center gap-2">
            {switching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              currentWorkspace && getWorkspaceIcon(currentWorkspace.type)
            )}
            <SelectValue>
              {currentWorkspace?.name || 'Personal Workspace'}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((ws) => (
            <SelectItem key={`${ws.type}:${ws.id || ''}`} value={`${ws.type}:${ws.id || ''}`}>
              <div className="flex items-center gap-2">
                {getWorkspaceIcon(ws.type)}
                <span>{ws.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
