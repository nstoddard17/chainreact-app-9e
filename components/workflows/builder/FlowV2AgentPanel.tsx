"use client"

/**
 * FlowV2AgentPanel.tsx
 *
 * Complete agent panel extracted from WorkflowBuilderV2.
 * Contains chat interface, staged chips, plan list, and build controls.
 */

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
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
  const { buildMachine, agentInput, isAgentLoading, agentMessages, nodeConfigs } = state
  const {
    onInputChange,
    onSubmit,
    onBuild,
    onContinueNode,
    onSkipNode,
    onUndoToPreviousStage,
    onCancelBuild,
    onNodeConfigChange,
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

  // Helper: Update field configuration for a node
  const handleFieldChange = (nodeId: string, fieldName: string, value: any) => {
    onNodeConfigChange(nodeId, fieldName, value)

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
  const validateRequiredFields = (planNode: any, requiresConnection: boolean): { isValid: boolean; missingFields: string[] } => {
    const requiredFields = getRequiredUserFields(planNode.nodeType)
    const config = nodeConfigs[planNode.id] || {}
    const missingFields: string[] = []

    // Check connection if required
    if (requiresConnection && !config.connection) {
      missingFields.push('connection')
    }

    // Check all other required fields
    requiredFields.forEach(field => {
      if (field.required && field.name !== 'connection') {
        const value = config[field.name]
        if (!value || value === '') {
          missingFields.push(field.name)
        }
      }
    })

    return {
      isValid: missingFields.length === 0,
      missingFields
    }
  }

  // Helper: Get connected integrations for a provider
  const getProviderConnections = (providerId: string) => {
    return integrations.filter(int =>
      int.id.toLowerCase() === providerId.toLowerCase() && int.isConnected
    )
  }

  // Helper: Get account-specific display name for a connection
  const getConnectionDisplayName = (connection: any, providerId: string): string => {
    // Try to get account-specific information from the integration
    // This data is stored in additional fields during OAuth callback

    // For Slack: show team name
    if (providerId === 'slack' && connection.team_name) {
      return `${connection.team_name} (Slack)`
    }

    // For Gmail/Google: show email
    if ((providerId === 'gmail' || providerId === 'google-drive') && connection.email) {
      return connection.email
    }

    // For Microsoft products: show email
    if ((providerId === 'microsoft-outlook' || providerId === 'microsoft-onedrive' || providerId === 'microsoft-teams') && connection.email) {
      return connection.email
    }

    // For other providers: show account name or email if available
    if (connection.account_name) {
      return connection.account_name
    }
    if (connection.email) {
      return connection.email
    }

    // Fallback to connection name or provider name
    return connection.name || `${getProviderDisplayName(providerId)} Account`
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
      console.log('[OAuth Setup] Starting OAuth for', providerId)
      console.log('[OAuth Setup] Connections before:', connectionsBefore.length, 'IDs:', connectionIdsBefore)

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
        console.log('[OAuth] Processing result:', data)

        // Handle both old format (OAUTH_SUCCESS/OAUTH_ERROR) and new format (oauth-complete)
        const isSuccess = data.type === 'OAUTH_SUCCESS' ||
                         (data.type === 'oauth-complete' && data.success)

        if (isSuccess) {
          // Refresh integrations to get the new connection
          console.log('[OAuth] Success! Refreshing integrations...')
          await refreshIntegrations()

          // Check if this account was already connected by comparing integration IDs
          const connectionsAfter = getProviderConnections(providerId)
          const connectionIdsAfter = connectionsAfter.map(c => c.integrationId || c.id)

          console.log('[OAuth] Connections after:', connectionsAfter.length, 'IDs:', connectionIdsAfter)
          console.log('[OAuth] IDs before:', connectionIdsBefore)
          console.log('[OAuth] IDs after:', connectionIdsAfter)

          // Check if all IDs are the same (upsert happened = duplicate account)
          const hasNewId = connectionIdsAfter.some(id => !connectionIdsBefore.includes(id))

          if (!hasNewId && connectionIdsAfter.length > 0) {
            // No new ID = duplicate account (upsert happened)
            console.log('[OAuth] 🔄 Duplicate account detected (upsert)')
            const existingConnection = connectionsAfter[0]
            if (existingConnection) {
              setDuplicateMessages(prev => ({
                ...prev,
                [nodeId]: {
                  show: true,
                  connectionName: getConnectionDisplayName(existingConnection, providerId)
                }
              }))
            }
          } else {
            // New ID found = new connection
            console.log('[OAuth] ✨ New connection detected')
            const newConnection = connectionsAfter.find(c =>
              !connectionIdsBefore.includes(c.integrationId || c.id)
            )
            if (newConnection) {
              console.log('[OAuth] Auto-selecting new connection:', newConnection.integrationId || newConnection.id)
              handleFieldChange(nodeId, 'connection', newConnection.integrationId || newConnection.id)
            }
          }
        }
      }

      // Method 1: Listen for BroadcastChannel (works when postMessage is blocked by COOP)
      let broadcastChannel: BroadcastChannel | null = null
      try {
        broadcastChannel = new BroadcastChannel('oauth_channel')
        console.log('[OAuth] 📡 Listening on BroadcastChannel')
        broadcastChannel.onmessage = async (event) => {
          console.log('[OAuth] 📡 BroadcastChannel message received:', event.data)
          if (event.data.type === 'oauth-complete' || event.data.type === 'OAUTH_SUCCESS' || event.data.type === 'OAUTH_ERROR') {
            broadcastChannel?.close()
            popup?.close()
            await processOAuthResult(event.data)
          }
        }
      } catch (e) {
        console.log('[OAuth] BroadcastChannel not available:', e)
      }

      // Method 2: Poll localStorage (fallback for COOP scenarios)
      console.log('[OAuth] 🔍 Polling localStorage for OAuth response')
      const storageCheckInterval = setInterval(() => {
        // Check for OAuth response in localStorage
        const keys = Object.keys(localStorage).filter(k => k.startsWith('oauth_response_'))
        for (const key of keys) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}')
            if (data.timestamp && Date.now() - new Date(data.timestamp).getTime() < 60000) {
              console.log('[OAuth] 💾 Found OAuth response in localStorage:', data)
              localStorage.removeItem(key) // Clean up
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
        console.log('[OAuth Handler] Received postMessage:', event.data.type, event.origin)

        if (event.origin !== window.location.origin) {
          console.log('[OAuth Handler] ❌ Origin mismatch, ignoring')
          return
        }

        const isOAuthMessage = event.data.type === 'OAUTH_SUCCESS' ||
                               event.data.type === 'OAUTH_ERROR' ||
                               event.data.type === 'oauth-complete'

        if (isOAuthMessage) {
          console.log('[OAuth] ✉️ postMessage received:', event.data)
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
            console.log('[OAuth] Popup closed, cleaning up listeners')
            clearInterval(checkClosed)
            clearInterval(storageCheckInterval)
            window.removeEventListener('message', handleMessage)
            broadcastChannel?.close()
          }
        } catch (e) {
          // COOP policy may block access to popup.closed - ignore this error
          // The popup will clean up when it receives a response anyway
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
          const errorText = await response.text()
          console.error(`Failed to load options for ${field.name}:`, response.status, errorText)
          return { fieldName: field.name, options: [] }
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

    setNodesDynamicOptions(prev => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], ...newOptions }
    }))

    // Save dynamic options to nodeConfigs so the workflow builder can access them
    // Use a special key that the workflow builder will recognize and move to savedDynamicOptions
    onNodeConfigChange(nodeId, '__savedDynamicOptions__', { ...newOptions })

    // Clear loading state
    setLoadingFieldsByNode(prev => ({
      ...prev,
      [nodeId]: new Set()
    }))

    // Remove from loading ref (allow future reloads if needed)
    loadingNodesRef.current.delete(nodeId)

    console.log('[FlowV2AgentPanel] ✅ Finished loading dynamic options for node:', nodeId, newOptions)
  }, [getNodeSchema, onNodeConfigChange])

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
  useEffect(() => {
    const planNodes = buildMachine.plan || []

    console.log('[FlowV2AgentPanel] Checking for dynamic fields to load...')
    console.log('[FlowV2AgentPanel] nodeConfigs:', nodeConfigs)
    console.log('[FlowV2AgentPanel] nodesDynamicOptions:', nodesDynamicOptions)

    planNodes.forEach(planNode => {
      const connectionId = nodeConfigs[planNode.id]?.connection

      console.log(`[FlowV2AgentPanel] Node ${planNode.id}: connectionId=${connectionId}, providerId=${planNode.providerId}, hasOptions=${!!nodesDynamicOptions[planNode.id]}`)

      // If connection is set and we haven't loaded options yet
      if (connectionId && planNode.providerId && !nodesDynamicOptions[planNode.id]) {
        console.log(`[FlowV2AgentPanel] ✅ Loading dynamic options for ${planNode.id}`)
        loadDynamicOptionsForNode(planNode.id, planNode.nodeType, planNode.providerId, connectionId)
      }
    })
  }, [buildMachine.plan, nodeConfigs, nodesDynamicOptions, loadDynamicOptionsForNode])

  // BuilderHeader is 56px tall (from tokens.css --header-height)
  // The panel sits below it, so we must subtract header height
  const headerHeight = 56
  const safeWidth = Math.max(0, Math.min(width, viewportDimensions.width))
  const safeHeight = viewportDimensions.height > 0 ? Math.max(0, viewportDimensions.height - headerHeight) : undefined

  return (
    <div
      className={`absolute top-0 left-0 bg-white border-r border-border shadow-xl z-40 transition-transform duration-300 ease-in-out max-w-full overflow-hidden ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{
        width: `${safeWidth}px`,
        maxWidth: '100vw',
        height: safeHeight ? `${safeHeight}px` : '100%',
        maxHeight: safeHeight ? `${safeHeight}px` : '100%',
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
                                  const requiresConnection = !!(planNode.providerId && planNode.providerId !== 'ai' && planNode.providerId !== 'logic' && planNode.providerId !== 'mapper')

                                  return (
                                    <div key={planNode.id} className={`plan-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${showExpanded ? 'expanded' : ''} w-full overflow-visible min-w-0`}>
                                      <div className="flex-1 flex items-center gap-3 min-w-0 overflow-hidden">
                                        <div className="flex items-center justify-center shrink-0">
                                          {planNode.providerId ? (
                                            <img
                                              src={`/integrations/${planNode.providerId}.svg`}
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

                                        return (
                                          <div className="w-full mt-4 space-y-3 border-t border-border pt-4">
                                            {requiresConnection && (
                                              <div className="space-y-2">
                                                <p className="text-sm text-muted-foreground">
                                                  {defaultConnectionValue && providerConnections.length === 1
                                                    ? `Using your ${getProviderDisplayName(planNode.providerId || '')} connection`
                                                    : "Let's connect the service first — pick a saved connection or make a new one"}
                                                </p>

                                                <div className="space-y-2">
                                                  <label className="text-xs font-medium text-foreground">
                                                    Your {getProviderDisplayName(planNode.providerId || '')} connection
                                                  </label>
                                                  {/* Dropdown and Connect button in same row */}
                                                  <div className="flex gap-2">
                                                    <select
                                                      className={`flex-1 px-3 py-2 text-sm border rounded-md bg-background ${
                                                        fieldErrors[planNode.id]?.some(err => err.toLowerCase().includes('connection'))
                                                          ? 'border-red-500 focus:border-red-600 focus:ring-red-500'
                                                          : 'border-input'
                                                      }`}
                                                      value={defaultConnectionValue}
                                                      onChange={(e) => handleFieldChange(planNode.id, 'connection', e.target.value)}
                                                    >
                                                      <option value="">Select an option...</option>
                                                      {providerConnections.map(conn => (
                                                        <option key={conn.integrationId || conn.id} value={conn.integrationId || conn.id}>
                                                          {getConnectionDisplayName(conn, planNode.providerId || '')}
                                                        </option>
                                                      ))}
                                                    </select>
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
                                                </div>
                                              </div>
                                            )}

                                            {/* Required field dropdowns */}
                                            {requiredFields.filter(f => f.name !== 'connection').map((field) => {
                                              const FieldIcon = getFieldTypeIcon(field.type)
                                              const isLoading = loadingFieldsByNode[planNode.id]?.has(field.name) || false

                                              // Get options from dynamically loaded data OR fallback to defaultOptions
                                              const dynamicOptionsForField = nodesDynamicOptions[planNode.id]?.[field.name] || []
                                              const optionsToDisplay = dynamicOptionsForField.length > 0
                                                ? dynamicOptionsForField
                                                : (field.defaultOptions || [])

                                              return (
                                                <div key={field.name} className="space-y-2">
                                                  <label className="text-xs font-medium text-foreground flex items-center gap-2">
                                                    <FieldIcon className="w-4 h-4 text-muted-foreground" />
                                                    {field.label || field.name}
                                                    {field.required && <span className="text-red-500">*</span>}
                                                    {isLoading && <span className="text-xs text-muted-foreground">(Loading...)</span>}
                                                  </label>
                                                  <select
                                                    className={`w-full px-3 py-2 text-sm border rounded-md bg-background ${
                                                      fieldErrors[planNode.id]?.some(err =>
                                                        err.toLowerCase().includes(field.label?.toLowerCase() || field.name.toLowerCase())
                                                      )
                                                        ? 'border-red-500 focus:border-red-600 focus:ring-red-500'
                                                        : 'border-input'
                                                    }`}
                                                    value={nodeConfigs[planNode.id]?.[field.name] || ''}
                                                    onChange={(e) => handleFieldChange(planNode.id, field.name, e.target.value)}
                                                    disabled={isLoading}
                                                  >
                                                    <option value="">
                                                      {isLoading ? 'Loading options...' : (field.placeholder || 'Select an option...')}
                                                    </option>
                                                    {optionsToDisplay.map(opt => (
                                                      <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
                                                        {typeof opt === 'string' ? opt : (opt.label || (opt as any).name)}
                                                      </option>
                                                    ))}
                                                  </select>
                                                  {field.description && (
                                                    <p className="text-xs text-muted-foreground">{field.description}</p>
                                                  )}
                                                </div>
                                              )
                                            })}

                                            {/* Continue/Skip buttons - moved up closer to fields */}
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
                                                    console.log('[Continue Button] Clicked!')
                                                    console.log('[Continue Button] planNode:', planNode)
                                                    console.log('[Continue Button] nodeConfigs for this node:', nodeConfigs[planNode.id])

                                                    // Validate all required fields before continuing
                                                    const validation = validateRequiredFields(planNode, requiresConnection)

                                                    if (!validation.isValid) {
                                                      console.log('[Continue Button] ❌ Validation failed:', validation.missingFields)

                                                      // Set error messages for missing fields
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

                                                      return
                                                    }

                                                    // Clear errors and continue
                                                    setFieldErrors(prev => {
                                                      const { [planNode.id]: _, ...rest } = prev
                                                      return rest
                                                    })

                                                    console.log('[Continue Button] ✅ Validation passed, continuing...')
                                                    onContinueNode()
                                                  }}
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

                      {buildMachine.state === BuildState.PLAN_READY && (
                        <Button onClick={onBuild} variant="primary" size="lg" className="w-full">
                          {Copy.planReadyCta}
                        </Button>
                      )}

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
                            className="text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-2"
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
                              Your flow is configured and tested. You can now publish it to make it live.
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Button variant="success" size="lg" className="w-full">
                                Publish Workflow
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 gap-0.5"
                  disabled={isAgentLoading}
                >
                  <AtSign className="w-2.5 h-2.5 text-blue-500" />
                  add context
                </Button>
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
