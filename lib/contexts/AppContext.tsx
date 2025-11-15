"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkflowStore } from "@/stores/workflowStore"
import { logger } from "@/lib/utils/logger"

interface AppContextValue {
  // Auth state
  isAuthReady: boolean
  userId: string | null

  // Workspace state
  workspaceType: 'personal' | 'team' | 'organization'
  workspaceId: string | null

  // Overall ready state
  isReady: boolean

  // Actions
  setWorkspaceContext: (type: 'personal' | 'team' | 'organization', id?: string | null) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

interface AppContextProviderProps {
  children: React.ReactNode
  // Optional: Allow overriding workspace context from parent
  initialWorkspaceType?: 'personal' | 'team' | 'organization'
  initialWorkspaceId?: string | null
}

export function AppContextProvider({
  children,
  initialWorkspaceType = 'personal',
  initialWorkspaceId = null
}: AppContextProviderProps) {
  const { initialized: authInitialized, user } = useAuthStore()
  const integrationStore = useIntegrationStore()
  const workflowStore = useWorkflowStore()

  const [isReady, setIsReady] = useState(false)
  const [workspaceType, setWorkspaceType] = useState<'personal' | 'team' | 'organization'>(initialWorkspaceType)
  const [workspaceId, setWorkspaceId] = useState<string | null>(initialWorkspaceId)

  // Sync workspace context to both stores
  const setWorkspaceContext = useCallback(async (
    type: 'personal' | 'team' | 'organization',
    id?: string | null
  ) => {
    logger.debug('[AppContext] Setting workspace context:', { type, id })

    setWorkspaceType(type)
    setWorkspaceId(id || null)

    // Update both stores in parallel
    await Promise.all([
      integrationStore.setWorkspaceContext(type, id),
      workflowStore.setWorkspaceContext(type, id)
    ])
  }, [integrationStore, workflowStore])

  // Initialize when auth is ready
  useEffect(() => {
    if (!authInitialized || !user) {
      setIsReady(false)
      return
    }

    logger.debug('[AppContext] Auth ready, app context initialized')
    setIsReady(true)
  }, [authInitialized, user])

  const value: AppContextValue = {
    isAuthReady: authInitialized && !!user,
    userId: user?.id || null,
    workspaceType,
    workspaceId,
    isReady,
    setWorkspaceContext,
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within AppContextProvider')
  }
  return context
}
