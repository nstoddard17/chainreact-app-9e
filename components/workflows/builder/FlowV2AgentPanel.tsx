"use client"

/**
 * FlowV2AgentPanel.tsx
 *
 * Complete agent panel extracted from WorkflowBuilderV2.
 * Contains chat interface, staged chips, plan list, and build controls.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import Image from "next/image"
import {
  Sparkles,
  HelpCircle,
  ArrowLeft,
  AtSign,
  Pause,
} from "lucide-react"
import {
  BuildState,
  type BuildStateMachine,
  getStateLabel,
  getBadgeForState,
} from "@/src/lib/workflows/builder/BuildState"
import { Copy } from "./ui/copy"
import { ChatStatusBadge, type BadgeState } from "./ui/ChatStatusBadge"
import { getProviderDisplayName } from "@/lib/workflows/builder/providerNames"
import { useIntegrations } from "@/hooks/use-integrations"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { getFieldTypeIcon } from "./ui/FieldTypeIcons"
import "./styles/FlowBuilder.anim.css"
import type { ChatMessage } from "@/lib/workflows/ai-agent/chat-service"
import { useDynamicOptions } from "../configuration/hooks/useDynamicOptions"
import type { DynamicOptionsState } from "../configuration/utils/types"
import { ProviderSelectionUI } from "../ai-agent/ProviderSelectionUI"
import { ProviderBadge } from "../ai-agent/ProviderBadge"
import { ProviderDropdownSelector } from "../ai-agent/ProviderDropdownSelector"
import { ConnectionStatusCard } from "../ai-agent/ConnectionStatusCard"
import { NodeConfigurationCard } from "../ai-agent/NodeConfigurationCard"
import { PreferencesSaveCard } from "../ai-agent/PreferencesSaveCard"
import { PromptEnhancer } from "../ai-agent/PromptEnhancer"
import { getProviderOptions } from "@/lib/workflows/ai-agent/providerDisambiguation"
import { getNodeConfigQuestions } from "@/lib/workflows/ai-agent/nodeConfigQuestions"
import { isNodeTypeConnectionExempt, isProviderConnectionExempt } from "../configuration/utils/connectionExemptions"

/**
 * Maps provider IDs to their actual icon filenames
 */
function getProviderIconPath(providerId: string): string {
  const iconMap: Record<string, string> = {
    'outlook': 'microsoft-outlook',
    'yahoo-mail': 'yahoo-mail',
  }
  return `/integrations/${iconMap[providerId] || providerId}.svg`
}

interface PanelLayoutProps {
  isOpen: boolean
  onClose: () => void
  width: number
}

interface PanelStateProps {
  buildMachine: BuildStateMachine
  agentInput: string
  isAgentLoading: boolean
  agentMessages: ChatMessage[]
  nodeConfigs: Record<string, Record<string, any>>
  awaitingProviderSelection?: boolean
  providerCategory?: any
}

interface PanelActions {
  onInputChange: (value: string) => void
  onSubmit: () => void
  onBuild: () => void
  onContinueNode: () => void
  onSkipNode: () => void
  onUndoToPreviousStage: () => void
  onCancelBuild: () => void
  onNodeConfigChange: (nodeId: string, fieldName: string, value: any) => void
  onProviderSelect?: (providerId: string) => void
  onProviderConnect?: (providerId: string) => void
  onProviderChange?: (providerId: string) => void
  // New handlers for enhanced chat flow
  onProviderDropdownSelect?: (providerId: string, isConnected: boolean) => void
  onConnectionComplete?: (providerId: string, email?: string) => void
  onConnectionSkip?: (providerId: string) => void
  onNodeConfigComplete?: (nodeType: string, config: Record<string, any>) => void
  onNodeConfigSkip?: (nodeType: string) => void
  onPreferencesSave?: (selectedIds: string[]) => void
  onPreferencesSkip?: () => void
}

interface FlowV2AgentPanelProps {
  layout: PanelLayoutProps
  state: PanelStateProps
  actions: PanelActions
}

export function FlowV2AgentPanel({
  layout,
  state,
  actions,
}: FlowV2AgentPanelProps) {
  const { isOpen, onClose, width } = layout
  const {
    buildMachine,
    agentInput,
    isAgentLoading,
    agentMessages,
    nodeConfigs,
    awaitingProviderSelection,
    providerCategory,
  } = state
  const {
    onInputChange,
    onSubmit,
    onBuild,
    onContinueNode,
    onSkipNode,
    onUndoToPreviousStage,
    onCancelBuild,
    onNodeConfigChange,
    onProviderSelect,
    onProviderConnect,
    onProviderChange,
    // New handlers for enhanced chat flow
    onProviderDropdownSelect,
    onConnectionComplete,
    onConnectionSkip,
    onNodeConfigComplete,
    onNodeConfigSkip,
    onPreferencesSave,
    onPreferencesSkip,
  } = actions

  // Use state for viewport dimensions to avoid hydration mismatch
  const [viewportDimensions, setViewportDimensions] = useState<{ height: number; width: number }>({ height: 0, width: 0 })

  // Fetch user's integrations for connection dropdown
  const { integrations, loading: integrationsLoading, refreshIntegrations } = useIntegrations()

  // Track duplicate connection messages per node
  const [duplicateMessages, setDuplicateMessages] = useState<Record<string, { show: boolean; connectionName: string }>>({})

  // Track dynamic options for each node in the plan
  const [nodesDynamicOptions, setNodesDynamicOptions] = useState<Record<string, DynamicOptionsState>>({})

  // Track which fields are loading for each node
  const [loadingFieldsByNode, setLoadingFieldsByNode] = useState<Record<string, Set<string>>>({})

  // Track validation errors for required fields
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  // Track expired connections per node (connectionId -> isExpired)
  const [expiredConnections, setExpiredConnections] = useState<Record<string, boolean>>({})

  // Track whether provider validation is in progress (to show loading state before displaying connection status)
  const [isValidatingProviders, setIsValidatingProviders] = useState(false)

  // Track which connections are being reconnected (to avoid showing duplicate message during reconnect)
  const [reconnectingConnections, setReconnectingConnections] = useState<Record<string, boolean>>({})

  // Track which nodes have completed their configuration questions (from nodeConfigQuestions.ts)
  const [completedConfigQuestions, setCompletedConfigQuestions] = useState<Record<string, boolean>>({})

  // Track which nodes have the connection dropdown expanded (for changing connection)
  // When collapsed (false), shows compact "Using: account@example.com" indicator
  const [expandedConnectionNodes, setExpandedConnectionNodes] = useState<Record<string, boolean>>({})

  // Track which nodes are currently loading to prevent duplicate requests (infinite loop prevention)
  const loadingNodesRef = useRef<Set<string>>(new Set())

  // Ref for chat messages container to control scroll behavior
  const chatMessagesRef = useRef<HTMLDivElement>(null)

  // Track previous build state to detect COMPLETE transition
  const prevBuildStateRef = useRef<BuildState>(buildMachine.state)

  // Set viewport dimensions after mount to avoid SSR/client mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      setViewportDimensions({ height: window.innerHeight, width: window.innerWidth })
    }
  }, [])

  // Listen for integration events (connection, reconnection) and refresh integrations
  useEffect(() => {
    const handleIntegrationEvent = async () => {
      console.log('[FlowV2AgentPanel] 🔄 Integration event received, refreshing integrations')
      // Clear ALL expired-related state when user reconnects
      // This is necessary because:
      // 1. The new connection might have a different integrationId
      // 2. The old connectionId in expiredConnections won't match the new integration
      // 3. We need to let the provider be re-validated with fresh state
      validationExpiredAtRef.current = {}
      validatedProvidersRef.current.clear()
      setExpiredConnections({})
      await refreshIntegrations()
    }

    // Listen for both new connections and reconnections
    window.addEventListener('integration-connected', handleIntegrationEvent)
    window.addEventListener('integration-reconnected', handleIntegrationEvent)

    return () => {
      window.removeEventListener('integration-connected', handleIntegrationEvent)
      window.removeEventListener('integration-reconnected', handleIntegrationEvent)
    }
  }, [refreshIntegrations])

  // Prevent scroll movement when transitioning to COMPLETE state
  useEffect(() => {
    const prevState = prevBuildStateRef.current
    const currentState = buildMachine.state

    console.log('[FlowV2AgentPanel] 🔄 Build state changed:', { prevState, currentState })

    // If transitioning to COMPLETE, prevent any scrolling
    if (currentState === BuildState.COMPLETE && prevState !== BuildState.COMPLETE) {
      const container = chatMessagesRef.current
      if (!container) {
        console.log('[FlowV2AgentPanel] ⚠️ No container ref found for scroll lock')
        return
      }

      console.log('[FlowV2AgentPanel] 🔒 Locking scroll at position:', container.scrollTop)

      // Save current scroll position
      const savedScrollTop = container.scrollTop

      // Save original overflow style
      const originalOverflow = container.style.overflow

      // Completely disable scrolling via CSS
      container.style.overflow = 'hidden'
      container.style.scrollBehavior = 'auto'

      // Create a scroll lock function as backup
      const lockScroll = (e: Event) => {
        console.log('[FlowV2AgentPanel] 📍 Scroll detected, preventing! Current:', container.scrollTop, 'Saved:', savedScrollTop)
        e.preventDefault()
        e.stopPropagation()
        container.scrollTop = savedScrollTop
      }

      // Add scroll event listener to prevent any scroll changes
      container.addEventListener('scroll', lockScroll, { passive: false, capture: true })

      // Also set scroll position immediately
      container.scrollTop = savedScrollTop

      // Use multiple strategies to ensure scroll stays locked
      const timeoutId = setTimeout(() => {
        if (container) container.scrollTop = savedScrollTop
      }, 0)

      const rafId = requestAnimationFrame(() => {
        if (container) container.scrollTop = savedScrollTop
      })

      // Clean up after 1 second (enough time for React to finish rendering)
      const cleanupId = setTimeout(() => {
        console.log('[FlowV2AgentPanel] 🔓 Releasing scroll lock')
        container.removeEventListener('scroll', lockScroll, { capture: true } as any)
        container.style.overflow = originalOverflow
        container.style.scrollBehavior = ''
      }, 1000)

      return () => {
        clearTimeout(timeoutId)
        clearTimeout(cleanupId)
        cancelAnimationFrame(rafId)
        container.removeEventListener('scroll', lockScroll, { capture: true } as any)
        container.style.overflow = originalOverflow
        container.style.scrollBehavior = ''
      }
    }

    // Update previous state
    prevBuildStateRef.current = currentState
  }, [buildMachine.state])

  // Helper: Get default connection for a provider
  // Returns the connection ID that should be selected by default
  // Priority: 1) User's manual selection, 2) Default connection (future), 3) Single connection auto-select
  const getDefaultConnection = (providerId: string, nodeId: string, providerConnections: any[]) => {
    // Priority 1: User has already selected a connection
    const userSelection = nodeConfigs[nodeId]?.connection
    if (userSelection) {
      return userSelection
    }

    // Priority 2: Check if there's a marked default connection (future support)
    const defaultConnection = providerConnections.find(conn => conn.isDefault)
    if (defaultConnection?.integrationId) {
      console.log('[FlowV2AgentPanel] Using default connection:', defaultConnection.integrationId)
      return defaultConnection.integrationId
    }

    // Priority 3: Auto-select if there's only one connection
    if (providerConnections.length === 1 && providerConnections[0].integrationId) {
      console.log('[FlowV2AgentPanel] Auto-selecting single connection:', providerConnections[0].integrationId)
      return providerConnections[0].integrationId
    }

    // No default - user must select
    return ''
  }

  // Helper: Get node component schema by type
  const getNodeSchema = (nodeType: string) => {
    return ALL_NODE_COMPONENTS.find(n => n.type === nodeType)
  }

  // Helper: Determine which fields require user input
  // Fields need user input if they are: required, have dynamic options, OR are connection selectors
  const getRequiredUserFields = (nodeType: string) => {
    const schema = getNodeSchema(nodeType)
    if (!schema?.configSchema) return []

    return schema.configSchema.filter(field =>
      // Connection field (always required)
      field.name === 'connection' ||
      // Required fields with dynamic data (server/channel selections, etc.)
      (field.required && field.dynamic) ||
      // Required select/combobox fields
      (field.required && (field.type === 'select' || field.type === 'combobox'))
    )
  }

  // Helper: Evaluate hidden condition for a field
  // Handles the $deps/$condition format used in node schemas
  const isFieldHidden = (field: any, nodeConfig: Record<string, any>): boolean => {
    if (!field.hidden) return false

    // Handle object-based hidden conditions with $deps and $condition
    if (typeof field.hidden === 'object' && field.hidden.$condition) {
      const condition = field.hidden.$condition
      for (const [fieldName, check] of Object.entries(condition)) {
        const fieldValue = nodeConfig[fieldName]
        const checkObj = check as Record<string, any>

        // $exists: false means hidden when field is empty/missing
        if (checkObj.$exists === false) {
          if (!fieldValue || fieldValue === '') {
            return true // Field is hidden
          }
        }
        // $exists: true means hidden when field has a value
        if (checkObj.$exists === true) {
          if (fieldValue && fieldValue !== '') {
            return true
          }
        }
        // Direct value comparison
        if (!('$exists' in checkObj)) {
          if (fieldValue === checkObj) {
            return true
          }
        }
      }
      return false
    }

    // Boolean hidden value
    if (typeof field.hidden === 'boolean') {
      return field.hidden
    }

    return false
  }

  // Helper: Update field configuration for a node
  const handleFieldChange = (nodeId: string, fieldName: string, value: any) => {
    onNodeConfigChange(nodeId, fieldName, value)

    // If user manually changes connection, clear reconnecting flag for old connection
    if (fieldName === 'connection') {
      const oldConnection = nodeConfigs[nodeId]?.connection
      if (oldConnection && oldConnection !== value) {
        setReconnectingConnections(prev => {
          const { [oldConnection]: _, ...rest } = prev
          return rest
        })
      }
    }

    // Clear validation error for this field when user changes it
    setFieldErrors(prev => {
      const nodeErrors = prev[nodeId] || []
      if (nodeErrors.length === 0) return prev

      // Get the plan node to find field definition
      const planNode = buildMachine.plan?.find(n => n.id === nodeId)
      if (!planNode) return prev

      const requiredFields = getRequiredUserFields(planNode.nodeType)

      // Find the field label to match against error messages
      let fieldLabel = fieldName
      if (fieldName === 'connection') {
        fieldLabel = 'Connection'
      } else {
        const field = requiredFields.find(f => f.name === fieldName)
        fieldLabel = field?.label || fieldName
      }

      // Filter out errors that match this field's label
      const updatedErrors = nodeErrors.filter(err =>
        !err.toLowerCase().includes(fieldLabel.toLowerCase())
      )

      if (updatedErrors.length === 0) {
        const { [nodeId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [nodeId]: updatedErrors }
    })
  }

  // Helper: Validate all required fields for current node
  const validateRequiredFields = (planNode: any, requiresConnection: boolean): { isValid: boolean; missingFields: string[]; needsSetup: boolean } => {
    const requiredFields = getRequiredUserFields(planNode.nodeType)
    const config = nodeConfigs[planNode.id] || {}
    const missingFields: string[] = []

    // Check connection if required (now just for warning, not blocking)
    if (requiresConnection && !config.connection) {
      missingFields.push('connection')
    }

    // Check all other required fields (now just for warning, not blocking)
    // Skip hidden fields - they shouldn't be required until their dependencies are met
    requiredFields.forEach(field => {
      if (field.required && field.name !== 'connection') {
        // Skip hidden fields - their dependencies aren't met
        if (isFieldHidden(field, config)) {
          return
        }
        const value = config[field.name]
        if (!value || value === '') {
          missingFields.push(field.name)
        }
      }
    })

    return {
      isValid: missingFields.length === 0,
      missingFields,
      needsSetup: missingFields.length > 0 // Track if node needs setup
    }
  }

  // Helper: Get connected integrations for a provider
  // Wrapped in useCallback to prevent unnecessary re-renders and useEffect re-triggers
  const getProviderConnections = useCallback((providerId: string) => {
    return integrations.filter(int =>
      int.id.toLowerCase() === providerId.toLowerCase() && int.isConnected
    )
  }, [integrations])

  // Helper: Check if a provider has any expired connections
  // Checks both: 1) expiredConnections state (detected via validation API calls)
  //              2) integration status in database (already expired before page load)
  const isProviderExpired = (providerId: string): boolean => {
    // Find all integrations for this provider (including expired ones that are no longer "connected")
    const providerIntegrations = integrations.filter(int =>
      int.id.toLowerCase() === providerId.toLowerCase()
    )

    // Check if any of this provider's connections are expired
    const result = providerIntegrations.some(conn => {
      const connectionId = conn.integrationId || conn.id
      // Check 1: Expired via validation API call (stored in expiredConnections state)
      if (expiredConnections[connectionId] === true) {
        console.log(`[isProviderExpired] ${providerId} expired via validation (connectionId: ${connectionId})`)
        return true
      }
      // Check 2: Already expired in database (status field from useIntegrations)
      // This handles tokens that were already expired before the page loaded
      // Check for various expired status values (case-insensitive)
      const status = (conn.status || '').toLowerCase()
      if (status === 'expired' || status === 'needs_reauthorization' || status === 'unauthorized' || status === 'invalid') {
        console.log(`[isProviderExpired] ${providerId} expired via status: ${conn.status}`)
        return true
      }
      // Check 3: Has integrationId but isConnected is false (indicates expired/disconnected)
      if (conn.integrationId && !conn.isConnected) {
        console.log(`[isProviderExpired] ${providerId} has integrationId but isConnected=false, status: ${conn.status}`)
        return true
      }
      return false
    })

    console.log(`[isProviderExpired] ${providerId} result: ${result}, integrations found: ${providerIntegrations.length}`)
    return result
  }

  // Helper: Get account-specific display name for a connection
  const getConnectionDisplayName = (connection: any, providerId: string): string => {
    // DEBUG: Log the full connection object to see what fields we have
    console.log('[getConnectionDisplayName] providerId:', providerId)
    console.log('[getConnectionDisplayName] connection:', connection)
    console.log('[getConnectionDisplayName] connection keys:', Object.keys(connection))
    console.log('[getConnectionDisplayName] has metadata?:', !!connection.metadata)
    console.log('[getConnectionDisplayName] has email?:', !!connection.email)
    console.log('[getConnectionDisplayName] metadata:', connection.metadata)

    // Account info is stored in metadata (new) or top-level (old, backward compat)
    const email = connection.metadata?.email || connection.email
    const accountName = connection.metadata?.account_name || connection.account_name
    const teamName = connection.team_name // Slack stores this at top level

    console.log('[getConnectionDisplayName] extracted email:', email)
    console.log('[getConnectionDisplayName] extracted accountName:', accountName)
    console.log('[getConnectionDisplayName] extracted teamName:', teamName)

    // For Slack: show email if available, with team name for context
    if (providerId === 'slack') {
      if (email && teamName) {
        return `${email} (${teamName})`
      }
      if (email) {
        return email
      }
      if (teamName) {
        return `${teamName} (Slack)`
      }
    }

    // For Gmail/Google: show email
    if ((providerId === 'gmail' || providerId === 'google-drive') && email) {
      console.log('[getConnectionDisplayName] returning email for Gmail:', email)
      return email
    }

    // For Microsoft products: show email
    if ((providerId === 'microsoft-outlook' || providerId === 'microsoft-onedrive' || providerId === 'microsoft-teams') && email) {
      return email
    }

    // For other providers: show account name or email if available
    if (accountName) {
      return accountName
    }
    if (email) {
      return email
    }

    // Fallback to connection name or provider name
    const fallback = connection.name || `${getProviderDisplayName(providerId)} Account`
    console.log('[getConnectionDisplayName] using fallback:', fallback)
    return fallback
  }

  // Helper: Handle OAuth popup for connecting integration
  const handleConnectIntegration = async (providerId: string, nodeId: string) => {
    try {
      // Clear any existing duplicate message for this node
      setDuplicateMessages(prev => {
        const { [nodeId]: _, ...rest } = prev
        return rest
      })

      // Generate OAuth URL
      const response = await fetch("/api/integrations/auth/generate-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider: providerId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('OAuth URL generation failed:', errorData)
        throw new Error(errorData.error || errorData.message || "Failed to generate OAuth URL")
      }

      const { authUrl } = await response.json()

      // Get connections before OAuth - store IDs not just objects
      const connectionsBefore = getProviderConnections(providerId)
      const connectionIdsBefore = connectionsBefore.map(c => c.integrationId || c.id)

      // Open OAuth in popup
      const width = 600
      const height = 700
      const left = (window.screen.width - width) / 2
      const top = (window.screen.height - height) / 2

      const popup = window.open(
        authUrl,
        'oauth-popup',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.')
      }

      // Process OAuth result (called from any listener)
      const processOAuthResult = async (data: any) => {
        // Handle both old format (OAUTH_SUCCESS/OAUTH_ERROR) and new format (oauth-complete)
        const isSuccess = data.type === 'OAUTH_SUCCESS' ||
                         (data.type === 'oauth-complete' && data.success)

        if (isSuccess) {
          // Refresh integrations to get the new connection
          await refreshIntegrations()

          // Check if this account was already connected by comparing integration IDs
          const connectionsAfter = getProviderConnections(providerId)
          const connectionIdsAfter = connectionsAfter.map(c => c.integrationId || c.id)

          // Check if all IDs are the same (upsert happened = duplicate account)
          const hasNewId = connectionIdsAfter.some(id => !connectionIdsBefore.includes(id))

          if (!hasNewId && connectionIdsAfter.length > 0) {
            // No new ID = duplicate account (upsert happened)
            const existingConnection = connectionsAfter[0]
            if (existingConnection) {
              const connectionId = existingConnection.integrationId || existingConnection.id

              // Check if this was a reconnection attempt
              const wasReconnecting = reconnectingConnections[connectionId]

              // Clear reconnecting flag
              setReconnectingConnections(prev => {
                const { [connectionId]: _, ...rest } = prev
                return rest
              })

              // Only show duplicate message if this was NOT a reconnection
              if (!wasReconnecting) {
                setDuplicateMessages(prev => ({
                  ...prev,
                  [nodeId]: {
                    show: true,
                    connectionName: getConnectionDisplayName(existingConnection, providerId)
                  }
                }))
              }

              // DON'T clear expired flag here - wait until data loads successfully
              // The expired banner will stay visible until loadDynamicOptionsForNode succeeds
            }
          } else {
            // New ID found = new connection
            const newConnection = connectionsAfter.find(c =>
              !connectionIdsBefore.includes(c.integrationId || c.id)
            )
            if (newConnection) {
              const connectionId = newConnection.integrationId || newConnection.id

              // Clear reconnecting flag if it was set
              setReconnectingConnections(prev => {
                const { [connectionId]: _, ...rest } = prev
                return rest
              })

              // DON'T clear expired flag here - wait until data loads successfully
              handleFieldChange(nodeId, 'connection', connectionId)
            }
          }
        }
      }

      // Method 1: Listen for BroadcastChannel (works when postMessage is blocked by COOP)
      let broadcastChannel: BroadcastChannel | null = null
      try {
        broadcastChannel = new BroadcastChannel('oauth_channel')
        broadcastChannel.onmessage = async (event) => {
          if (event.data.type === 'oauth-complete' || event.data.type === 'OAUTH_SUCCESS' || event.data.type === 'OAUTH_ERROR') {
            broadcastChannel?.close()
            popup?.close()
            await processOAuthResult(event.data)
          }
        }
      } catch (e) {
        // BroadcastChannel not available
      }

      // Method 2: Poll localStorage (fallback for COOP scenarios)
      const storageCheckInterval = setInterval(() => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('oauth_response_'))
        for (const key of keys) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}')
            if (data.timestamp && Date.now() - new Date(data.timestamp).getTime() < 60000) {
              localStorage.removeItem(key)
              clearInterval(storageCheckInterval)
              broadcastChannel?.close()
              popup?.close()
              processOAuthResult(data)
              break
            }
          } catch (e) {
            // Invalid JSON, skip
          }
        }
      }, 500)

      // Method 3: Listen for postMessage (traditional method)
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return

        const isOAuthMessage = event.data.type === 'OAUTH_SUCCESS' ||
                               event.data.type === 'OAUTH_ERROR' ||
                               event.data.type === 'oauth-complete'

        if (isOAuthMessage) {
          window.removeEventListener('message', handleMessage)
          clearInterval(storageCheckInterval)
          broadcastChannel?.close()
          popup?.close()
          await processOAuthResult(event.data)
        }
      }

      window.addEventListener('message', handleMessage)

      // Cleanup if popup is closed manually (note: popup.closed may be blocked by COOP)
      const checkClosed = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(checkClosed)
            clearInterval(storageCheckInterval)
            window.removeEventListener('message', handleMessage)
            broadcastChannel?.close()
          }
        } catch (e) {
          // COOP policy may block access to popup.closed - ignore this error
        }
      }, 1000)

    } catch (error) {
      console.error('Error connecting integration:', error)
      alert(error instanceof Error ? error.message : 'Failed to connect integration')
    }
  }

  // Helper: Load dynamic options for a node's fields when connection is selected
  const loadDynamicOptionsForNode = useCallback(async (nodeId: string, nodeType: string, providerId: string, connectionId: string) => {
    // Prevent duplicate requests for the same node
    if (loadingNodesRef.current.has(nodeId)) {
      console.log(`[FlowV2AgentPanel] ⏭️ Skipping duplicate load for ${nodeId}`)
      return
    }

    const schema = getNodeSchema(nodeType)
    if (!schema?.configSchema) return

    // Find all fields with dynamic options
    const dynamicFields = schema.configSchema.filter(field =>
      field.dynamic && field.name !== 'connection'
    )

    if (dynamicFields.length === 0) return

    // Mark this node as loading immediately (prevents duplicate requests)
    loadingNodesRef.current.add(nodeId)

    // Also set a placeholder in state to prevent useEffect from retriggering
    setNodesDynamicOptions(prev => ({
      ...prev,
      [nodeId]: prev[nodeId] || {} // Create empty object if it doesn't exist
    }))

    console.log('[FlowV2AgentPanel] Loading dynamic options for node:', nodeId, 'fields:', dynamicFields.map(f => f.name))

    // Mark fields as loading
    setLoadingFieldsByNode(prev => ({
      ...prev,
      [nodeId]: new Set(dynamicFields.map(f => f.name))
    }))

    // Load options for each dynamic field
    const loadPromises = dynamicFields.map(async (field) => {
      try {
        // Get the dataType from field.dynamic
        let dataType = typeof field.dynamic === 'string' ? field.dynamic : String(field.dynamic || '')

        // Slack API expects underscores, but schemas use hyphens
        // Gmail API expects exactly what's in the schema (mix of hyphens and underscores)
        if (providerId === 'slack') {
          dataType = dataType.replace(/-/g, '_')
        }

        console.log(`[FlowV2AgentPanel] Loading ${field.name} for ${providerId}, dataType: ${dataType}, connectionId: ${connectionId}`)

        // Call the API to load options (POST request with JSON body)
        const response = await fetch(`/api/integrations/${providerId}/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId: connectionId,
            dataType: dataType,
            options: {}
          })
        })

        if (!response.ok) {
          // Try to parse error as JSON to check for expired token
          try {
            const errorData = await response.json()

            // Silently handle expired/disconnected integrations
            if (errorData.details?.needsReconnection || errorData.details?.currentStatus === 'expired') {
              // Token expired - mark connection as expired
              console.log(`[FlowV2AgentPanel] Connection ${connectionId} is expired - refreshing integrations`)
              // Record timestamp to prevent useEffect from clearing this immediately
              validationExpiredAtRef.current[connectionId] = Date.now()
              setExpiredConnections(prev => ({ ...prev, [connectionId]: true }))
              // Refresh integrations to get updated status from database
              refreshIntegrations().catch(err => console.error('Failed to refresh integrations:', err))
              return { fieldName: field.name, options: [], expired: true }
            }

            // Other errors - log them
            console.error(`Failed to load options for ${field.name}:`, response.status, errorData)
            return { fieldName: field.name, options: [] }
          } catch (e) {
            // Not JSON - log as text
            const errorText = await response.text()
            console.error(`Failed to load options for ${field.name}:`, response.status, errorText)
            return { fieldName: field.name, options: [] }
          }
        }

        const result = await response.json()
        console.log(`[FlowV2AgentPanel] Received data for ${field.name}:`, result)

        // Extract options from response (API returns { data: [...], success: true })
        const options = Array.isArray(result.data) ? result.data : result.data || []

        return { fieldName: field.name, options }
      } catch (error) {
        console.error(`Error loading options for ${field.name}:`, error)
        return { fieldName: field.name, options: [] }
      }
    })

    const results = await Promise.all(loadPromises)

    // Update options for this node
    const newOptions: DynamicOptionsState = {}
    results.forEach(({ fieldName, options }) => {
      newOptions[fieldName] = options
    })

    // DEBUG: Log exactly what we're storing
    console.log(`[FlowV2AgentPanel] 📦 Storing options for node ${nodeId}:`, {
      fieldNames: Object.keys(newOptions),
      optionCounts: Object.fromEntries(Object.entries(newOptions).map(([k, v]) => [k, (v as any[]).length])),
      sampleData: Object.fromEntries(Object.entries(newOptions).map(([k, v]) => [k, (v as any[]).slice(0, 2)]))
    })

    setNodesDynamicOptions(prev => {
      const next = {
        ...prev,
        [nodeId]: { ...prev[nodeId], ...newOptions }
      }
      console.log(`[FlowV2AgentPanel] 📦 State after update for ${nodeId}:`, {
        nodeKeys: Object.keys(next),
        fieldKeys: next[nodeId] ? Object.keys(next[nodeId]) : 'undefined'
      })
      return next
    })

    // Save dynamic options to nodeConfigs so the workflow builder can access them
    // Use a special key that the workflow builder will recognize and move to savedDynamicOptions
    onNodeConfigChange(nodeId, '__savedDynamicOptions__', { ...newOptions })

    // Check if we successfully loaded data (any field has options)
    const hasSuccessfulLoad = results.some((r: any) => !(r.expired) && r.options && r.options.length > 0)

    // If successful, clear expired flag for this connection - reconnection verified!
    if (hasSuccessfulLoad && connectionId) {
      console.log(`[FlowV2AgentPanel] ✅ Connection ${connectionId} verified - clearing expired flag`)
      setExpiredConnections(prev => {
        const { [connectionId]: _, ...rest } = prev
        return rest
      })

      // Refresh integrations to update the node's visual state (remove red border/disconnected icon)
      await refreshIntegrations()
      console.log(`[FlowV2AgentPanel] ✅ Refreshed integrations - node should update visually`)
    }

    // Clear loading state
    setLoadingFieldsByNode(prev => ({
      ...prev,
      [nodeId]: new Set()
    }))

    // Remove from loading ref (allow future reloads if needed)
    loadingNodesRef.current.delete(nodeId)

    console.log('[FlowV2AgentPanel] ✅ Finished loading dynamic options for node:', nodeId, newOptions)
  }, [getNodeSchema, onNodeConfigChange, refreshIntegrations])

  // Auto-save default connections to nodeConfigs when they're auto-selected
  useEffect(() => {
    const planNodes = buildMachine.plan || []

    planNodes.forEach(planNode => {
      if (!planNode.providerId) return

      const providerConnections = getProviderConnections(planNode.providerId)
      const defaultConnectionValue = getDefaultConnection(planNode.providerId, planNode.id, providerConnections)
      const currentConnection = nodeConfigs[planNode.id]?.connection

      // If we have a default connection and it's not already saved, save it
      if (defaultConnectionValue && !currentConnection) {
        console.log(`[FlowV2AgentPanel] Auto-saving connection for ${planNode.id}:`, defaultConnectionValue)
        onNodeConfigChange(planNode.id, 'connection', defaultConnectionValue)
      }
    })
  }, [buildMachine.plan, nodeConfigs, integrations, getDefaultConnection, getProviderConnections, onNodeConfigChange])

  // Watch for connection changes and auto-load dynamic fields
  // ONLY load when we're in WAITING_USER state for a specific node
  useEffect(() => {
    // Don't load options until we're actually configuring nodes (WAITING_USER state)
    if (buildMachine.state !== BuildState.WAITING_USER) {
      return
    }

    const planNodes = buildMachine.plan || []
    const currentNodeIndex = buildMachine.progress.currentIndex

    // Only load options for the CURRENT node being configured
    if (currentNodeIndex >= 0 && currentNodeIndex < planNodes.length) {
      const planNode = planNodes[currentNodeIndex]
      const connectionId = nodeConfigs[planNode.id]?.connection

      // If connection is set and we haven't loaded options yet
      if (connectionId && planNode.providerId && !nodesDynamicOptions[planNode.id]) {
        loadDynamicOptionsForNode(planNode.id, planNode.nodeType, planNode.providerId, connectionId)
      }
    }
  }, [buildMachine.state, buildMachine.plan, buildMachine.progress.currentIndex, nodeConfigs, nodesDynamicOptions, loadDynamicOptionsForNode])

  // Validate provider tokens when plan becomes ready
  // This proactively checks if tokens are still valid before the user tries to build
  const validatedProvidersRef = useRef<Set<string>>(new Set())
  const isValidatingRef = useRef<boolean>(false)
  // Track when validation detected expired connections - prevents useEffect from clearing them prematurely
  const validationExpiredAtRef = useRef<Record<string, number>>({})

  // Create a stable string key from provider IDs to avoid re-running effect when plan array reference changes
  const planProviderIdsKey = useMemo(() => {
    const planNodes = buildMachine.plan || []
    const providerIds = [...new Set(planNodes
      .map(node => node.providerId)
      .filter(Boolean)
    )].sort().join(',')
    return providerIds
  }, [buildMachine.plan])

  useEffect(() => {
    if (buildMachine.state !== BuildState.PLAN_READY) {
      return
    }

    // Prevent concurrent validation runs
    if (isValidatingRef.current) {
      return
    }

    // Parse provider IDs from the stable key
    const providerIds = planProviderIdsKey ? planProviderIdsKey.split(',').filter(Boolean) : []

    // Filter to only providers not yet validated
    const providersToValidate = providerIds.filter(id => !validatedProvidersRef.current.has(id))

    // If nothing to validate, skip
    if (providersToValidate.length === 0) {
      return
    }

    // Mark ALL providers as validated IMMEDIATELY to prevent re-runs
    // This must happen synchronously before any async operations
    providersToValidate.forEach(id => validatedProvidersRef.current.add(id))
    isValidatingRef.current = true

    // Start validation - show loading state
    setIsValidatingProviders(true)
    console.log(`[FlowV2AgentPanel] 🔍 Starting validation for ${providersToValidate.length} providers:`, providersToValidate)

    // Validate all providers in parallel and wait for completion
    const validateProvider = async (providerId: string): Promise<void> => {
      // Get the connection for this provider - use integrations directly to avoid stale closure
      const providerConnections = integrations.filter(int =>
        int.id.toLowerCase() === providerId.toLowerCase() && int.isConnected
      )
      if (providerConnections.length === 0) {
        console.log(`[FlowV2AgentPanel] ⏭️ No connection for ${providerId}, skipping validation`)
        return // No connection to validate
      }

      const connection = providerConnections[0]
      const connectionId = connection.integrationId || connection.id

      console.log(`[FlowV2AgentPanel] 🔍 Validating ${providerId} connection:`, connectionId)

      try {
        // Make a lightweight API call to validate the token
        // Use a simple data type that all providers should support
        const dataType = `${providerId}_channels` // Most providers have a channels/lists endpoint
        const response = await fetch(`/api/integrations/${providerId}/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationId: connectionId,
            dataType: dataType,
            options: {}
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))

          // Check if token is expired
          if (errorData.details?.needsReconnection || errorData.details?.currentStatus === 'expired' || response.status === 401) {
            console.log(`[FlowV2AgentPanel] ⚠️ ${providerId} token is expired`)
            // Record timestamp to prevent useEffect from clearing this immediately
            validationExpiredAtRef.current[connectionId] = Date.now()
            setExpiredConnections(prev => ({ ...prev, [connectionId]: true }))
          }
        } else {
          console.log(`[FlowV2AgentPanel] ✅ ${providerId} token is valid`)
        }
      } catch (error) {
        console.error(`[FlowV2AgentPanel] Error validating ${providerId}:`, error)
      }
    }

    // Run all validations in parallel and wait for all to complete
    Promise.all(providersToValidate.map(validateProvider))
      .then(() => {
        console.log(`[FlowV2AgentPanel] ✅ All provider validations complete`)
        // Refresh integrations to get updated status from database
        return refreshIntegrations()
      })
      .catch(err => console.error('Failed to refresh integrations:', err))
      .finally(() => {
        setIsValidatingProviders(false)
        isValidatingRef.current = false
      })
  // Use stable dependencies only - planProviderIdsKey is a string that only changes when actual provider IDs change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildMachine.state, planProviderIdsKey])

  // Clear expired status when integrations update and provider becomes connected
  // This handles the case where user reconnects via OAuth
  useEffect(() => {
    if (Object.keys(expiredConnections).length === 0) return

    // Don't clear expired status while validation is in progress
    // The validation may have just set the expired flag, and we shouldn't immediately clear it
    // based on stale database status
    if (isValidatingRef.current) {
      console.log(`[FlowV2AgentPanel] ⏸️ Skipping expired status clear while validation in progress`)
      return
    }

    // For each expired connection, check if it's now connected
    const newExpiredConnections = { ...expiredConnections }
    let hasChanges = false
    const now = Date.now()

    Object.keys(expiredConnections).forEach(connectionId => {
      // Don't clear expired status if it was recently detected by validation (within last 5 seconds)
      // This prevents race condition where validation detects expired but database hasn't updated yet
      const expiredAt = validationExpiredAtRef.current[connectionId]
      if (expiredAt && (now - expiredAt) < 5000) {
        console.log(`[FlowV2AgentPanel] ⏸️ Skipping clear for ${connectionId} - validation detected expired ${now - expiredAt}ms ago`)
        return
      }

      // Find the integration with this connectionId
      const integration = integrations.find(i => (i.integrationId || i.id) === connectionId)
      if (integration && integration.isConnected) {
        // Provider is now connected, clear the expired flag
        delete newExpiredConnections[connectionId]
        hasChanges = true
        console.log(`[FlowV2AgentPanel] ✅ Cleared expired status for ${integration.id} (connection ${connectionId})`)

        // Also clear the validation timestamp
        delete validationExpiredAtRef.current[connectionId]

        // Also clear from validated providers so it can be re-validated if needed
        validatedProvidersRef.current.delete(integration.id)
      }
    })

    if (hasChanges) {
      setExpiredConnections(newExpiredConnections)
    }
  }, [integrations, expiredConnections])

  // BuilderHeader is 56px tall (from tokens.css --header-height)
  // The panel sits below it, so we must subtract header height
  const headerHeight = 56
  const safeWidth = Math.max(0, Math.min(width, viewportDimensions.width))
  const safeHeight = viewportDimensions.height > 0 ? Math.max(0, viewportDimensions.height - headerHeight) : undefined

  return (
    <div
      className={`absolute top-0 bottom-0 left-0 bg-white border-r border-border shadow-xl z-40 transition-transform duration-300 ease-in-out max-w-full overflow-hidden ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{
        width: `${safeWidth}px`,
        maxWidth: '100vw',
      }}
    >
      <div className="h-full flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo_transparent.png"
              alt="ChainReact"
              width={32}
              height={32}
              className="w-8 h-8"
            />
            <h2 className="font-semibold text-base text-foreground">React Agent</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-foreground hover:bg-accent"
            >
              <HelpCircle className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-gray-300 hover:text-gray-400 hover:bg-accent"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Chat Content */}
        <div className="flex-1 overflow-hidden flex flex-col w-full min-h-0">
          {/* Welcome message */}
          {(buildMachine.state === BuildState.IDLE || agentMessages.length === 0) && (
            <div className="text-sm text-foreground space-y-2 pt-2 pb-3 px-4 w-full overflow-hidden">
              <p className="break-words">Hello, what would you like to craft?</p>
              <p className="text-xs break-words">Tell me about your goal or task, and include the tools you normally use (like your email, calendar, or CRM).</p>
            </div>
          )}

          {/* Chat messages */}
          <div ref={chatMessagesRef} className="flex-1 overflow-y-auto w-full overflow-x-hidden min-h-0 px-4">
            <div className="space-y-4 py-4 pb-8 w-full min-h-0">
              {/* User messages - only shown in IDLE state (to prevent duplicates during build) */}
              {buildMachine.state === BuildState.IDLE && agentMessages.filter(m => m && m.role === 'user').map((msg, index) => {
                const text = (msg as any).text ?? (msg as any).content ?? ''
                const created = (msg as any).createdAt ?? (msg as any).timestamp ?? null
                let formattedTime: string | null = null
                if (created) {
                  const date = created instanceof Date ? created : new Date(created)
                  if (!Number.isNaN(date.getTime())) {
                    formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                }

                return (
                  <div key={`user-${index}`} className="flex justify-end w-full">
                    <div
                      className="max-w-[80%] rounded-lg px-4 py-3 bg-gray-100 text-gray-900"
                      style={{
                        wordBreak: "break-word",
                        overflowWrap: "anywhere"
                    }}
                  >
                    <p className="text-sm whitespace-pre-wrap" style={{ wordBreak: "break-word" }}>
                      {text}
                    </p>
                    {formattedTime && (
                      <p className="text-xs opacity-70 mt-1">
                        {formattedTime}
                      </p>
                    )}
                  </div>
                </div>
                )
              })}

              {/* Assistant messages - only shown in IDLE state if they have text content or interactive meta */}
              {buildMachine.state === BuildState.IDLE && agentMessages.filter(m => {
                if (!m || m.role !== 'assistant') return false
                const text = (m as any).text ?? (m as any).content ?? ''
                const meta = (m as any).meta ?? {}
                // Show if has text OR has interactive components
                return text.trim().length > 0 ||
                       meta.providerDropdown ||
                       meta.connectionStatus ||
                       meta.nodeConfig ||
                       meta.preferencesSave
              }).map((msg, index) => {
                const text = (msg as any).text ?? (msg as any).content ?? ''
                const meta = (msg as any).meta ?? {}

                return (
                  <div key={`assistant-${index}`} className="flex w-full flex-col gap-2">
                    {/* Text bubble */}
                    {text.trim().length > 0 && (
                      <div className="max-w-[80%] rounded-lg px-4 py-3 bg-orange-50 text-gray-900 dark:bg-orange-900/20 dark:text-gray-100">
                        <p className="text-sm whitespace-pre-wrap" style={{ wordBreak: "break-word" }}>
                          {text}
                        </p>
                      </div>
                    )}

                    {/* Interactive components from meta */}
                    {meta.providerDropdown && onProviderDropdownSelect && (
                      <div className="w-full max-w-[90%]">
                        <ProviderDropdownSelector
                          categoryName={meta.providerDropdown.category.displayName}
                          categoryKey={meta.providerDropdown.category.vagueTerm}
                          providers={meta.providerDropdown.providers}
                          preSelectedProviderId={meta.providerDropdown.preSelectedProviderId}
                          onSelect={onProviderDropdownSelect}
                        />
                      </div>
                    )}

                    {meta.connectionStatus && onConnectionComplete && (
                      <div className="w-full max-w-[90%]">
                        <ConnectionStatusCard
                          providerId={meta.connectionStatus.providerId}
                          onConnected={(email) => onConnectionComplete(meta.connectionStatus.providerId, email)}
                          onSkip={onConnectionSkip ? () => onConnectionSkip(meta.connectionStatus.providerId) : undefined}
                        />
                      </div>
                    )}

                    {meta.nodeConfig && onNodeConfigComplete && onNodeConfigSkip && (() => {
                      const definition = getNodeConfigQuestions(meta.nodeConfig.nodeType)
                      if (definition) {
                        return (
                          <div className="w-full max-w-[90%]">
                            <NodeConfigurationCard
                              nodeType={meta.nodeConfig.nodeType}
                              definition={definition}
                              onComplete={(config) => onNodeConfigComplete(meta.nodeConfig.nodeType, config)}
                              onSkip={() => onNodeConfigSkip(meta.nodeConfig.nodeType)}
                            />
                          </div>
                        )
                      }
                      return null
                    })()}

                    {meta.preferencesSave && onPreferencesSave && onPreferencesSkip && (
                      <div className="w-full max-w-[90%]">
                        <PreferencesSaveCard
                          selections={meta.preferencesSave.selections}
                          onComplete={onPreferencesSkip}
                          onSkip={onPreferencesSkip}
                        />
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Animated Build UI */}
              {buildMachine.state !== BuildState.IDLE && (
                <div className="space-y-4 w-full">
                  {/* User message */}
                  {agentMessages.filter(m => m && m.role === 'user').map((msg, index) => {
                    const text = (msg as any).text ?? (msg as any).content ?? ''
                    const created = (msg as any).createdAt ?? (msg as any).timestamp ?? null
                    let formattedTime: string | null = null
                    if (created) {
                      const date = created instanceof Date ? created : new Date(created)
                      if (!Number.isNaN(date.getTime())) {
                        formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      }
                    }

                    return (
                      <div key={index} className="flex justify-end w-full">
                        <div
                          className="max-w-[80%] rounded-lg px-4 py-3 bg-gray-100 text-gray-900"
                          style={{
                            wordBreak: "break-word",
                            overflowWrap: "anywhere"
                        }}
                      >
                        <p className="text-sm whitespace-pre-wrap" style={{ wordBreak: "break-word" }}>
                          {text}
                        </p>
                        {formattedTime && (
                          <p className="text-xs opacity-70 mt-1">
                            {formattedTime}
                          </p>
                        )}
                      </div>
                    </div>
                    )
                  })}

                  {/* Status Badge - updates as state transitions through planning */}
                  {(buildMachine.state === BuildState.THINKING ||
                    buildMachine.state === BuildState.SUBTASKS ||
                    buildMachine.state === BuildState.COLLECT_NODES ||
                    buildMachine.state === BuildState.OUTLINE ||
                    buildMachine.state === BuildState.PURPOSE) && (
                    <div className="flex w-full">
                      <ChatStatusBadge
                        text={(() => {
                          const currentNode = buildMachine.plan[buildMachine.progress.currentIndex]
                          const badge = getBadgeForState(buildMachine.state, currentNode?.title)
                          return badge?.text || ''
                        })()}
                        subtext={(() => {
                          const currentNode = buildMachine.plan[buildMachine.progress.currentIndex]
                          const badge = getBadgeForState(buildMachine.state, currentNode?.title)
                          return badge?.subtext
                        })()}
                        state="active"
                        className="build-progress-badge"
                        reducedMotion={typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches}
                      />
                    </div>
                  )}

                  {/* Outline text only shown during OUTLINE state, hidden once plan is ready */}
                  {buildMachine.state === BuildState.OUTLINE && buildMachine.stagedText.outline && (
                    <div className="flex w-full">
                      <div className="text-sm text-muted-foreground">
                        {buildMachine.stagedText.outline}
                      </div>
                    </div>
                  )}

                  {/* Plan Ready - Show plan list and Build button (only visible when PLAN_READY or later) */}
                  {(buildMachine.state === BuildState.PLAN_READY ||
                    buildMachine.state === BuildState.BUILDING_SKELETON ||
                    buildMachine.state === BuildState.WAITING_USER ||
                    buildMachine.state === BuildState.PREPARING_NODE ||
                    buildMachine.state === BuildState.TESTING_NODE ||
                    buildMachine.state === BuildState.COMPLETE) && (
                    <div className="flex flex-col w-full gap-3">
                      <div className="flex w-full">
                        <div className="space-y-4 w-full overflow-visible min-w-0">
                          <div className="w-full overflow-visible min-w-0">
                            <div className="space-y-3 staged-text-item">
                              <div className="text-sm break-words">{getStateLabel(BuildState.PLAN_READY)}</div>
                              <div className="text-sm font-bold break-words">Flow plan:</div>

                              {/* Provider Selection or Badge - shown when provider needs to be selected or was auto-selected */}
                              {/* Provider badges are only shown during PLAN_READY state - hidden after Build is clicked */}
                              {(() => {
                                // Find the most recent assistant message with provider metadata
                                const assistantMessages = agentMessages.filter(m => m && m.role === 'assistant')
                                const lastMessage = assistantMessages[assistantMessages.length - 1]
                                const meta = (lastMessage as any)?.meta ?? {}

                                // NEW: Provider dropdown selector (enhanced UI) - always show during selection flow
                                if (meta.providerDropdown && onProviderDropdownSelect) {
                                  return (
                                    <div className="pt-2 pb-1">
                                      <ProviderDropdownSelector
                                        categoryName={meta.providerDropdown.category.displayName}
                                        categoryKey={meta.providerDropdown.category.vagueTerm}
                                        providers={meta.providerDropdown.providers}
                                        preSelectedProviderId={meta.providerDropdown.preSelectedProviderId}
                                        onSelect={onProviderDropdownSelect}
                                      />
                                    </div>
                                  )
                                }

                                // NEW: Connection status card (after provider selected)
                                if (meta.connectionStatus && onConnectionComplete) {
                                  return (
                                    <div className="pt-2 pb-1">
                                      <ConnectionStatusCard
                                        providerId={meta.connectionStatus.providerId}
                                        onConnected={(email) => onConnectionComplete(meta.connectionStatus.providerId, email)}
                                        onSkip={onConnectionSkip ? () => onConnectionSkip(meta.connectionStatus.providerId) : undefined}
                                      />
                                    </div>
                                  )
                                }

                                // NEW: Node configuration questions
                                if (meta.nodeConfig && onNodeConfigComplete && onNodeConfigSkip) {
                                  const definition = getNodeConfigQuestions(meta.nodeConfig.nodeType)
                                  if (definition) {
                                    return (
                                      <div className="pt-2 pb-1">
                                        <NodeConfigurationCard
                                          nodeType={meta.nodeConfig.nodeType}
                                          definition={definition}
                                          onComplete={(config) => onNodeConfigComplete(meta.nodeConfig.nodeType, config)}
                                          onSkip={() => onNodeConfigSkip(meta.nodeConfig.nodeType)}
                                        />
                                      </div>
                                    )
                                  }
                                }

                                // NEW: Preferences save card (at end of workflow)
                                if (meta.preferencesSave && onPreferencesSave && onPreferencesSkip) {
                                  return (
                                    <div className="pt-2 pb-1">
                                      <PreferencesSaveCard
                                        selections={meta.preferencesSave.selections}
                                        onComplete={onPreferencesSkip}
                                        onSkip={onPreferencesSkip}
                                      />
                                    </div>
                                  )
                                }

                                // Show provider selection UI if user needs to choose (legacy)
                                if (meta.providerSelection && onProviderSelect && onProviderConnect) {
                                  return (
                                    <div className="pt-2 pb-1">
                                      <ProviderSelectionUI
                                        categoryName={meta.providerSelection.category.displayName}
                                        providers={meta.providerSelection.providers}
                                        onSelect={onProviderSelect}
                                        onConnect={onProviderConnect}
                                      />
                                    </div>
                                  )
                                }

                                // Show provider badges for ALL selected providers - ONLY during PLAN_READY state
                                // After user clicks Build, the badges are hidden to simplify the UI
                                if (buildMachine.state === BuildState.PLAN_READY && meta.allSelectedProviders && meta.allSelectedProviders.length > 0 && onProviderChange && onProviderConnect) {
                                  return (
                                    <div className="pt-1 space-y-2">
                                      {meta.allSelectedProviders.map((providerMeta: any, idx: number) => (
                                        <ProviderBadge
                                          key={`${providerMeta.category.vagueTerm}-${idx}`}
                                          categoryName={providerMeta.category.displayName}
                                          selectedProvider={providerMeta.provider}
                                          allProviders={providerMeta.allProviders}
                                          onProviderChange={onProviderChange}
                                          onConnect={onProviderConnect}
                                          forceExpired={isProviderExpired(providerMeta.provider.id)}
                                          isValidating={isValidatingProviders}
                                        />
                                      ))}
                                    </div>
                                  )
                                }

                                // Fallback: Show single provider badge if auto-selected (backward compat) - ONLY during PLAN_READY
                                if (buildMachine.state === BuildState.PLAN_READY && meta.autoSelectedProvider && onProviderChange && onProviderConnect) {
                                  return (
                                    <div className="pt-1">
                                      <ProviderBadge
                                        categoryName={meta.autoSelectedProvider.category.displayName}
                                        selectedProvider={meta.autoSelectedProvider.provider}
                                        allProviders={meta.autoSelectedProvider.allProviders}
                                        onProviderChange={onProviderChange}
                                        onConnect={onProviderConnect}
                                        forceExpired={isProviderExpired(meta.autoSelectedProvider.provider.id)}
                                        isValidating={isValidatingProviders}
                                      />
                                    </div>
                                  )
                                }
                                return null
                              })()}

                              {/* Status badge shown during build directly below Flow plan: */}
                              {buildMachine.state === BuildState.BUILDING_SKELETON && (
                                <ChatStatusBadge
                                  text={getStateLabel(BuildState.BUILDING_SKELETON)}
                                  state="active"
                                  className="build-progress-badge"
                                  reducedMotion={typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches}
                                />
                              )}

                              <div className="space-y-2 w-full overflow-visible min-w-0">
                                {buildMachine.plan.map((planNode, index) => {
                                  const isDone = index < buildMachine.progress.done
                                  const isActive = index === buildMachine.progress.currentIndex
                                  const NodeIcon = planNode.icon

                                  const showExpanded = isActive && buildMachine.state === BuildState.WAITING_USER
                                  const requiresConnection = !isNodeTypeConnectionExempt(planNode.nodeType) &&
                                    !!(planNode.providerId && !isProviderConnectionExempt(planNode.providerId))

                                  return (
                                    <div key={planNode.id} className={`plan-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${showExpanded ? 'expanded' : ''} w-full overflow-visible min-w-0`}>
                                      <div className="flex-1 flex items-center gap-3 min-w-0 overflow-hidden">
                                        <div className="flex items-center justify-center shrink-0">
                                          {planNode.providerId ? (
                                            <img
                                              src={getProviderIconPath(planNode.providerId)}
                                              alt={planNode.providerId}
                                              className=""
                                              style={{ width: '24px', height: 'auto', flexShrink: 0 }}
                                            />
                                          ) : NodeIcon ? (
                                            <NodeIcon className="w-6 h-6 shrink-0" />
                                          ) : null}
                                        </div>
                                        <div className="flex-1 flex flex-col items-start gap-0.5 min-w-0 overflow-hidden">
                                          <div className="flex items-center gap-2 w-full">
                                            <span className="text-base font-medium break-words overflow-wrap-anywhere flex-1 min-w-0">{planNode.title}</span>
                                            {isActive && (buildMachine.state === BuildState.PREPARING_NODE || buildMachine.state === BuildState.TESTING_NODE || buildMachine.state === BuildState.BUILDING_SKELETON) && (
                                              <div className="chip blue shrink-0">
                                                <span className="text-xs">
                                                  {buildMachine.state === BuildState.TESTING_NODE && 'Testing node'}
                                                  {buildMachine.state === BuildState.PREPARING_NODE && 'Preparing node'}
                                                  {buildMachine.state === BuildState.BUILDING_SKELETON && 'Building node'}
                                                </span>
                                                <div className="pulse-dot" />
                                              </div>
                                            )}
                                          </div>
                                          {planNode.description && (
                                            <span className="text-xs text-muted-foreground break-words overflow-wrap-anywhere w-full">
                                              {planNode.description}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Expanded configuration section */}
                                      {showExpanded && (() => {
                                        const requiredFields = getRequiredUserFields(planNode.nodeType)
                                        const providerConnections = planNode.providerId ? getProviderConnections(planNode.providerId) : []
                                        const defaultConnectionValue = getDefaultConnection(planNode.providerId || '', planNode.id, providerConnections)
                                        const hasAutoSelectedConnection = defaultConnectionValue && !nodeConfigs[planNode.id]?.connection

                                        // Check if this node has config questions and if they've been completed
                                        const configDefinition = getNodeConfigQuestions(planNode.nodeType)
                                        const hasConfigQuestionsForNode = !!configDefinition
                                        const configQuestionsCompleted = completedConfigQuestions[planNode.id] || false

                                        // Determine if connection is needed and if it's been set
                                        const connectionIsSet = !requiresConnection || !!defaultConnectionValue

                                        // Create a loadDynamicOptions function for the NodeConfigurationCard (if needed)
                                        const loadDynamicOptionsForQuestions = async (optionType: string): Promise<Array<{value: string, label: string}>> => {
                                          if (!defaultConnectionValue || !planNode.providerId) return []

                                          try {
                                            // Use optionType directly as the dataType
                                            // The API expects full dataType like 'slack_channels', 'gmail_labels', etc.
                                            const response = await fetch(`/api/integrations/${planNode.providerId}/data`, {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                integrationId: defaultConnectionValue,
                                                dataType: optionType,
                                                options: {}
                                              })
                                            })

                                            if (!response.ok) return []

                                            const json = await response.json()
                                            // Unwrap the response - API returns { data: [...], success: true }
                                            const data = json.data || json
                                            // Transform API response to option format
                                            if (Array.isArray(data)) {
                                              return data.map((item: any) => ({
                                                value: item.id || item.value || String(item),
                                                label: item.name || item.label || item.title || String(item)
                                              }))
                                            }
                                            return []
                                          } catch (error) {
                                            console.error('Failed to load dynamic options:', error)
                                            return []
                                          }
                                        }

                                        // Show inline configuration (connection + required fields FIRST, then UX questions)
                                        // If connection is not set, show connection first
                                        // If connection is set but questions not completed, they'll be shown above
                                        // Determine if we should show compact connection view
                                        // Show compact view when: connection is auto-selected AND user hasn't clicked to expand
                                        const selectedConnection = providerConnections.find(
                                          conn => (conn.integrationId || conn.id) === defaultConnectionValue
                                        )
                                        const showCompactConnection = defaultConnectionValue &&
                                          selectedConnection &&
                                          !expandedConnectionNodes[planNode.id] &&
                                          !expiredConnections[defaultConnectionValue]

                                        return (
                                          <div className="w-full mt-4 space-y-3 border-t border-border pt-4">
                                            {requiresConnection && (
                                              <div className="space-y-2">
                                                {showCompactConnection ? (
                                                  // Compact connection view - shows when connection is already set
                                                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                                                    <div className="flex items-center gap-2">
                                                      <img
                                                        src={getProviderIconPath(planNode.providerId || '')}
                                                        alt={planNode.providerId || ''}
                                                        className="w-5 h-5"
                                                      />
                                                      <div>
                                                        <p className="text-sm font-medium text-foreground">
                                                          {getConnectionDisplayName(selectedConnection, planNode.providerId || '')}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                          Connected account
                                                        </p>
                                                      </div>
                                                    </div>
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="text-xs text-muted-foreground hover:text-foreground"
                                                      onClick={() => setExpandedConnectionNodes(prev => ({
                                                        ...prev,
                                                        [planNode.id]: true
                                                      }))}
                                                    >
                                                      Change
                                                    </Button>
                                                  </div>
                                                ) : (
                                                  // Full connection selection view
                                                  <>
                                                    <p className="text-sm text-muted-foreground">
                                                      {!defaultConnectionValue
                                                        ? "Let's connect the service first — pick a saved connection or make a new one"
                                                        : expandedConnectionNodes[planNode.id]
                                                          ? "Select a different connection:"
                                                          : `Using your ${getProviderDisplayName(planNode.providerId || '')} connection`}
                                                    </p>

                                                    <div className="space-y-2">
                                                      <label className="text-xs font-medium text-foreground">
                                                        Your {getProviderDisplayName(planNode.providerId || '')} connection
                                                      </label>
                                                      {/* Dropdown and Connect button in same row */}
                                                      <div className="flex gap-2">
                                                        <Select
                                                          value={defaultConnectionValue}
                                                          onValueChange={(value) => {
                                                            handleFieldChange(planNode.id, 'connection', value)
                                                            // Collapse back to compact view after selection
                                                            if (value) {
                                                              setExpandedConnectionNodes(prev => ({
                                                                ...prev,
                                                                [planNode.id]: false
                                                              }))
                                                            }
                                                          }}
                                                        >
                                                          <SelectTrigger
                                                            className={`flex-1 pr-3 ${
                                                              fieldErrors[planNode.id]?.some(err => err.toLowerCase().includes('connection'))
                                                                ? 'border-red-500 focus:border-red-600 focus:ring-red-500'
                                                                : ''
                                                            }`}
                                                          >
                                                            <SelectValue placeholder="Select an option..." />
                                                          </SelectTrigger>
                                                          <SelectContent>
                                                            {providerConnections.map(conn => (
                                                              <SelectItem key={conn.integrationId || conn.id} value={conn.integrationId || conn.id}>
                                                                {getConnectionDisplayName(conn, planNode.providerId || '')}
                                                              </SelectItem>
                                                            ))}
                                                          </SelectContent>
                                                        </Select>
                                                        <Button
                                                          variant="primary"
                                                          size="sm"
                                                          className="whitespace-nowrap"
                                                          onClick={() => {
                                                            handleConnectIntegration(planNode.providerId || '', planNode.id)
                                                          }}
                                                        >
                                                          + Connect
                                                        </Button>
                                                      </div>

                                                      {/* Duplicate account message */}
                                                      {duplicateMessages[planNode.id]?.show && (
                                                        <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-md">
                                                          <p className="text-xs text-yellow-800">
                                                            This account is already connected as <span className="font-medium">{duplicateMessages[planNode.id].connectionName}</span>
                                                          </p>
                                                        </div>
                                                      )}

                                                      {/* Expired connection warning */}
                                                      {defaultConnectionValue && expiredConnections[defaultConnectionValue] && (
                                                        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md">
                                                          <div className="flex items-start gap-2">
                                                            <div className="flex-1">
                                                              <p className="text-xs font-medium text-red-800">
                                                                Connection Expired
                                                              </p>
                                                              <p className="text-xs text-red-700 mt-1">
                                                                This {getProviderDisplayName(planNode.providerId || '')} account token has expired. Please reconnect to continue.
                                                              </p>
                                                            </div>
                                                            <Button
                                                              variant="destructive"
                                                              size="sm"
                                                              className="whitespace-nowrap shrink-0"
                                                              onClick={() => {
                                                                // Mark this connection as being reconnected (don't clear expired flag yet)
                                                                setReconnectingConnections(prev => ({
                                                                  ...prev,
                                                                  [defaultConnectionValue]: true
                                                                }))
                                                                handleConnectIntegration(planNode.providerId || '', planNode.id)
                                                              }}
                                                            >
                                                              Reconnect
                                                            </Button>
                                                          </div>
                                                        </div>
                                                      )}
                                                    </div>
                                                  </>
                                                )}
                                              </div>
                                            )}

                                            {/* Required field dropdowns */}
                                            {(() => {
                                              // Debug: Log which fields are visible vs hidden
                                              const fieldsExcludingConnection = requiredFields.filter(f => f.name !== 'connection')
                                              const visibleFields = fieldsExcludingConnection.filter(f => !isFieldHidden(f, nodeConfigs[planNode.id] || {}))
                                              const hiddenFields = fieldsExcludingConnection.filter(f => isFieldHidden(f, nodeConfigs[planNode.id] || {}))
                                              console.log(`[FlowV2AgentPanel] Field visibility for ${planNode.id}:`, {
                                                visible: visibleFields.map(f => f.name),
                                                hidden: hiddenFields.map(f => f.name),
                                                nodeConfig: nodeConfigs[planNode.id] || {}
                                              })
                                              return visibleFields
                                            })().map((field) => {
                                              const FieldIcon = getFieldTypeIcon(field.type)
                                              const isLoading = loadingFieldsByNode[planNode.id]?.has(field.name) || false

                                              // Get options from dynamically loaded data OR fallback to defaultOptions
                                              const dynamicOptionsForField = nodesDynamicOptions[planNode.id]?.[field.name] || []
                                              const optionsToDisplay = dynamicOptionsForField.length > 0
                                                ? dynamicOptionsForField
                                                : (field.defaultOptions || [])

                                              // DEBUG: Log what options are available for this field
                                              console.log(`[FlowV2AgentPanel RENDER] Field: ${field.name}, NodeId: ${planNode.id}`, {
                                                nodesDynamicOptionsKeys: Object.keys(nodesDynamicOptions),
                                                nodeOptionsKeys: nodesDynamicOptions[planNode.id] ? Object.keys(nodesDynamicOptions[planNode.id]) : 'undefined',
                                                dynamicOptionsForField: dynamicOptionsForField.length,
                                                optionsToDisplay: optionsToDisplay.length,
                                                isLoading
                                              })

                                              return (
                                                <div key={field.name} className="space-y-2">
                                                  <label className="text-xs font-medium text-foreground flex items-center gap-2">
                                                    <FieldIcon className="w-4 h-4 text-muted-foreground" />
                                                    {field.label || field.name}
                                                    {field.required && <span className="text-red-500">*</span>}
                                                    {isLoading && <span className="text-xs text-muted-foreground">(Loading...)</span>}
                                                  </label>
                                                  <Select
                                                    value={nodeConfigs[planNode.id]?.[field.name] || ''}
                                                    onValueChange={(value) => handleFieldChange(planNode.id, field.name, value)}
                                                    disabled={isLoading}
                                                  >
                                                    <SelectTrigger
                                                      className={`w-full pr-3 ${
                                                        fieldErrors[planNode.id]?.some(err =>
                                                          err.toLowerCase().includes(field.label?.toLowerCase() || field.name.toLowerCase())
                                                        )
                                                          ? 'border-red-500 focus:border-red-600 focus:ring-red-500'
                                                          : ''
                                                      }`}
                                                    >
                                                      <SelectValue
                                                        placeholder={isLoading ? 'Loading options...' : (field.placeholder || 'Select an option...')}
                                                      />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      {optionsToDisplay.map(opt => {
                                                        const optValue = typeof opt === 'string' ? opt : opt.value
                                                        const optLabel = typeof opt === 'string' ? opt : (opt.label || (opt as any).name)
                                                        return (
                                                          <SelectItem key={optValue} value={optValue}>
                                                            {optLabel}
                                                          </SelectItem>
                                                        )
                                                      })}
                                                    </SelectContent>
                                                  </Select>
                                                  {field.description && (
                                                    <p className="text-xs text-muted-foreground">{field.description}</p>
                                                  )}
                                                </div>
                                              )
                                            })}

                                            {/* NodeConfigurationCard for UX preference questions (message format, mentions, etc.)
                                                Shown AFTER connection and schema fields are set */}
                                            {hasConfigQuestionsForNode && !configQuestionsCompleted && connectionIsSet && configDefinition && onNodeConfigComplete && onNodeConfigSkip && (
                                              <div className="border-t border-border pt-3 mt-3">
                                                <NodeConfigurationCard
                                                  nodeType={planNode.nodeType}
                                                  definition={configDefinition}
                                                  loadDynamicOptions={loadDynamicOptionsForQuestions}
                                                  onComplete={(config) => {
                                                    // Mark questions as completed for this node
                                                    setCompletedConfigQuestions(prev => ({
                                                      ...prev,
                                                      [planNode.id]: true
                                                    }))
                                                    // Apply the config answers
                                                    Object.entries(config).forEach(([key, value]) => {
                                                      onNodeConfigChange(planNode.id, key, value)
                                                    })
                                                    onNodeConfigComplete(planNode.nodeType, config as Record<string, any>)
                                                  }}
                                                  onSkip={() => {
                                                    // Mark questions as completed (skipped)
                                                    setCompletedConfigQuestions(prev => ({
                                                      ...prev,
                                                      [planNode.id]: true
                                                    }))
                                                    onNodeConfigSkip(planNode.nodeType)
                                                  }}
                                                />
                                              </div>
                                            )}

                                            {/* Continue/Skip buttons - only show when NodeConfigurationCard is NOT visible
                                                (NodeConfigurationCard has its own Continue button) */}
                                            {!(hasConfigQuestionsForNode && !configQuestionsCompleted && connectionIsSet && configDefinition) && (
                                            <div className="space-y-2">
                                              {/* Show validation errors */}
                                              {fieldErrors[planNode.id] && fieldErrors[planNode.id].length > 0 && (
                                                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md">
                                                  <p className="text-xs font-medium text-red-700">Please fill in all required fields:</p>
                                                  <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
                                                    {fieldErrors[planNode.id].map(err => (
                                                      <li key={err}>{err}</li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}

                                              <div className="flex gap-2">
                                                <Button
                                                  onClick={() => {
                                                    // Check if connection is expired first
                                                    if (defaultConnectionValue && expiredConnections[defaultConnectionValue]) {
                                                      // Don't continue if connection is expired
                                                      console.log('[Continue] Blocked - connection is expired')
                                                      return
                                                    }

                                                    // Validate all required fields (non-blocking now)
                                                    const validation = validateRequiredFields(planNode, requiresConnection)

                                                    if (!validation.isValid) {
                                                      // Show warnings for missing fields but don't block
                                                      const errorMessages = validation.missingFields.map(fieldName => {
                                                        if (fieldName === 'connection') {
                                                          return 'Connection'
                                                        }
                                                        const field = requiredFields.find(f => f.name === fieldName)
                                                        return field?.label || fieldName
                                                      })

                                                      setFieldErrors(prev => ({
                                                        ...prev,
                                                        [planNode.id]: errorMessages
                                                      }))

                                                      // Mark node as needing setup in config
                                                      onNodeConfigChange(planNode.id, '__needsSetup__', true)
                                                      onNodeConfigChange(planNode.id, '__missingFields__', validation.missingFields)
                                                    } else {
                                                      // Clear setup flag if all fields are valid
                                                      onNodeConfigChange(planNode.id, '__needsSetup__', false)
                                                      onNodeConfigChange(planNode.id, '__missingFields__', [])
                                                    }

                                                    // Clear errors and continue anyway
                                                    setFieldErrors(prev => {
                                                      const { [planNode.id]: _, ...rest } = prev
                                                      return rest
                                                    })

                                                    onContinueNode()
                                                  }}
                                                  disabled={defaultConnectionValue && expiredConnections[defaultConnectionValue]}
                                                  variant="primary"
                                                  size="default"
                                                  className="flex-1"
                                                >
                                                  Continue
                                                </Button>
                                                <Button
                                                  onClick={onSkipNode}
                                                  variant="secondary"
                                                  size="default"
                                                  className="flex-1"
                                                >
                                                  Skip
                                                </Button>
                                              </div>
                                            </div>
                                            )}
                                          </div>
                                        )
                                      })()}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {buildMachine.state === BuildState.PLAN_READY && (() => {
                        // Check if any selected provider is not connected using LIVE integration status
                        const lastMsg = agentMessages.filter(m => m && m.role === 'assistant').pop()
                        const meta = (lastMsg as any)?.meta ?? {}
                        const allSelectedProviders = meta.allSelectedProviders || []
                        const singleProvider = meta.autoSelectedProvider?.provider

                        // Get provider IDs from the message metadata
                        const providerIds = [
                          ...allSelectedProviders.map((p: any) => p.provider?.id),
                          singleProvider?.id
                        ].filter(Boolean)

                        // Check live integration status from the store
                        const hasDisconnectedProvider = providerIds.some((providerId: string) => {
                          const integration = integrations.find(
                            i => i.id.toLowerCase() === providerId.toLowerCase() && i.isConnected
                          )
                          return !integration
                        })

                        // Also check if any provider has expired token (detected via validation)
                        const hasExpiredProvider = providerIds.some((providerId: string) => isProviderExpired(providerId))

                        // Disable build if validating, disconnected, or expired
                        const isBuildDisabled = isValidatingProviders || hasDisconnectedProvider || hasExpiredProvider

                        return (
                          <div className="space-y-2">
                            {isValidatingProviders && (
                              <p className="text-xs text-muted-foreground text-center">
                                Verifying connections...
                              </p>
                            )}
                            {!isValidatingProviders && (hasDisconnectedProvider || hasExpiredProvider) && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                                Connect all providers above to continue
                              </p>
                            )}
                            <Button
                              onClick={onBuild}
                              variant="primary"
                              size="lg"
                              className="w-full"
                              disabled={isBuildDisabled}
                            >
                              {Copy.planReadyCta}
                            </Button>
                          </div>
                        )
                      })()}

                      {buildMachine.state === BuildState.BUILDING_SKELETON && (
                        <div className="space-y-2 w-full overflow-hidden min-w-0">
                          <Button
                            onClick={onCancelBuild}
                            variant="destructive"
                            size="lg"
                            className="w-full"
                          >
                            {Copy.cancel}
                          </Button>
                          <Button
                            onClick={onUndoToPreviousStage}
                            variant="ghost"
                            className="text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-50 gap-2"
                            size="sm"
                          >
                            <ArrowLeft className="h-4 w-4" />
                            {Copy.undo}
                          </Button>
                        </div>
                      )}

                      {/* WAITING_USER state removed - Prerequisites are handled dynamically by the workflow builder */}

                      {buildMachine.state === BuildState.COMPLETE && (
                        <div className="setup-card w-full overflow-hidden min-w-0">
                          <div className="text-center space-y-3">
                            <div className="text-lg font-semibold text-green-600 break-words">
                              {getStateLabel(BuildState.COMPLETE)}
                            </div>
                            <div className="text-sm text-muted-foreground break-words">
                              Your workflow is ready! Close this panel to review and save your workflow.
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                variant="success"
                                size="lg"
                                className="w-full"
                                onClick={onClose}
                              >
                                Close & Review Workflow
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Chat input - Fixed at bottom */}
          <div className="mt-auto mb-4 px-4 relative min-w-0">
            <div className="border border-border rounded-lg bg-white p-2 min-w-0">
              <div className="mb-0.5 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 gap-0.5"
                    disabled={isAgentLoading}
                  >
                    <AtSign className="w-2.5 h-2.5 text-orange-500" />
                    add context
                  </Button>
                  <PromptEnhancer
                    prompt={agentInput}
                    connectedIntegrations={integrations.filter(i => i.isConnected).map(i => i.name || i.provider)}
                    onUseEnhanced={(enhanced) => onInputChange(enhanced)}
                    disabled={isAgentLoading}
                  />
                </div>
                {isAgentLoading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 gap-1"
                  >
                    <Pause className="w-3 h-3" />
                    pause
                  </Button>
                )}
              </div>

              <div className="relative">
                {agentInput === '' && (
                  <div className="absolute left-0 top-0 pointer-events-none px-3 py-2 text-sm text-muted-foreground leading-normal">
                    How can ChainReact help you today?
                  </div>
                )}
                <input
                  type="text"
                  value={agentInput}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && agentInput.trim()) {
                      onSubmit()
                    }
                  }}
                  disabled={isAgentLoading}
                  className="w-full border-0 shadow-none focus:outline-none focus:ring-0 text-sm text-foreground px-3 py-2 bg-transparent leading-normal"
                  style={{ caretColor: 'currentColor' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
