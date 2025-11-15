"use client"

/**
 * ConfigurationModal Layout Structure:
 *
 * The modal uses a two-column flexbox layout:
 *
 * Classes for identification:
 * - .modal-container: Main flex container (row layout on desktop, column on mobile)
 * - .modal-main-column / .config-content-area: Left column - main configuration form
 * - .modal-sidebar-column / .variable-picker-area: Right column - variable picker panel
 *
 * Layout specifications:
 * - Main column: flex-1 (takes remaining space), min-w-0 (allows shrinking)
 * - Sidebar column: w-80 (320px) on lg, w-96 (384px) on xl, flex-shrink-0 (fixed width)
 *
 * CRITICAL SOLUTION FOR KEEPING CONTENT IN LEFT COLUMN (Preventing overflow into right column):
 *
 * Problem: Wide content (like tables) can overflow from left column under the right column.
 *
 * Solution Pattern (MUST follow this exact hierarchy):
 * 1. Form container: Use "overflow-hidden" to clip all overflow
 * 2. Scrollable wrapper: Use "overflow-y-auto overflow-x-hidden" for vertical scroll only
 * 3. Content container: Regular div without special overflow rules
 * 4. Wide content wrapper: Use "w-full overflow-hidden" to constrain width
 * 5. Actual wide content: Use inline styles with maxWidth: '100%', overflow: 'hidden'
 * 6. For tables with horizontal scroll:
 *    - Outer div: style={{ maxWidth: '100%', overflow: 'hidden' }}
 *    - Scroll container: style={{ overflowX: 'auto', overflowY: 'auto' }}
 *    - Table element: Can be wider than container (minWidth: '100%')
 *
 * Key Rules:
 * - NEVER use ScrollArea component for containers with wide content (it doesn't constrain properly)
 * - ALWAYS use overflow-x-hidden on the main scrollable container
 * - ALWAYS use explicit maxWidth: '100%' on wide content containers
 * - Use inline styles for overflow control when Tailwind classes don't work
 *
 * Example Implementation:
 * <form className="overflow-hidden">
 *   <div className="overflow-y-auto overflow-x-hidden">
 *     <div>
 *       <div className="w-full overflow-hidden">
 *         <WideContentComponent style={{ maxWidth: '100%', overflow: 'hidden' }}>
 *           ...
 *         </WideContentComponent>
 *       </div>
 *     </div>
 *   </div>
 * </form>
 */

import React, { useState, useEffect, useRef, useCallback } from "react"
import { ConfigurationModalProps } from "./utils/types"
import type { NodeComponent } from "@/lib/workflows/nodes/types"
import ConfigurationForm from "./ConfigurationForm"
import { ConfigurationDataInspector } from "./ConfigurationDataInspector"
import { VariableDragProvider } from "./VariableDragContext"
import { Settings, Zap, Bot, MessageSquare, Mail, Calendar, FileText, Database, Globe, Shield, Bell, Sparkles, Wrench, SlidersHorizontal, TestTube2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { computeAutoMappingEntries } from "./autoMapping"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SetupTab, AdvancedTab, ResultsTab } from "./tabs"
import { getProviderBrandName } from "@/lib/integrations/brandNames"
import { StaticIntegrationLogo } from "@/components/ui/static-integration-logo"
import { TooltipProvider } from "@/components/ui/tooltip"

import { logger } from '@/lib/utils/logger'

/**
 * Label component for Pro features
 */
const ProLabel = () => (
  <span style={{
    background: '#b983d9',
    color: '#19171c',
    fontWeight: 700,
    fontSize: 12,
    borderRadius: 6,
    padding: '2px 8px',
    marginLeft: 8,
    display: 'inline-block',
    verticalAlign: 'middle',
    letterSpacing: 1,
  }}>PRO</span>
);

/**
 * Label component for Free features
 */
const FreeLabel = () => (
  <span style={{
    background: '#e6f4ea',
    color: '#1a7f37',
    fontWeight: 700,
    fontSize: 12,
    borderRadius: 6,
    padding: '2px 8px',
    marginLeft: 8,
    display: 'inline-block',
    verticalAlign: 'middle',
    letterSpacing: 1,
  }}>✅ Free</span>
);

const getFallbackNodeIcon = (nodeType: string) => {
  if (nodeType.includes('gmail')) return <Mail className="h-5 w-5" />
  if (nodeType.includes('discord')) return <MessageSquare className="h-5 w-5" />
  if (nodeType.includes('slack')) return <MessageSquare className="h-5 w-5" />
  if (nodeType.includes('ai') || nodeType.includes('agent')) return <Bot className="h-5 w-5" />
  if (nodeType.includes('calendar')) return <Calendar className="h-5 w-5" />
  if (nodeType.includes('notion')) return <FileText className="h-5 w-5" />
  if (nodeType.includes('database')) return <Database className="h-5 w-5" />
  if (nodeType.includes('webhook')) return <Globe className="h-5 w-5" />
  if (nodeType.includes('trigger')) return <Bell className="h-5 w-5" />
  if (nodeType.includes('action')) return <Zap className="h-5 w-5" />
  return <Settings className="h-5 w-5" />
}

const createNodeIconElement = (nodeInfo?: NodeComponent) => {
  if (!nodeInfo?.icon) return null
  const iconValue = nodeInfo.icon as any

  if (React.isValidElement(iconValue)) {
    return React.cloneElement(iconValue, {
      className: cn("h-6 w-6", iconValue.props?.className),
    })
  }

  if (typeof iconValue === "string") {
    const path = iconValue.startsWith("/") ? iconValue : `/integrations/${iconValue}.svg`
    return (
      <img
        src={path}
        alt={nodeInfo.title || nodeInfo.type || "Node icon"}
        className="h-6 w-6 object-contain"
        width={24}
        height={24}
        draggable={false}
      />
    )
  }

  if (typeof iconValue === "function" || typeof iconValue === "object") {
    const IconComponent = iconValue as React.ComponentType<{ className?: string }>
    return <IconComponent className="h-6 w-6" />
  }

  return null
}

const renderNodeBadge = (nodeInfo?: NodeComponent) => {
  // Prioritize provider logo when providerId exists (for integrations like Airtable, Gmail, etc.)
  if (nodeInfo?.providerId) {
    return (
      <StaticIntegrationLogo
        providerId={nodeInfo.providerId}
        providerName={getProviderBrandName(nodeInfo.providerId)}
      />
    )
  }

  // Fallback to custom icon element if no providerId
  const iconElement = createNodeIconElement(nodeInfo)
  if (iconElement) {
    return (
      <div className="p-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg flex items-center justify-center">
        {iconElement}
      </div>
    )
  }

  // Final fallback
  return (
    <div className="p-1.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white flex-shrink-0">
      {getFallbackNodeIcon(nodeInfo?.type || '')}
    </div>
  )
}

/**
 * Get node type badge color
 */
const getNodeTypeBadge = (nodeType: string) => {
  if (nodeType.includes('trigger')) {
    return <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200 text-xs sm:text-sm">Trigger</Badge>
  }
  if (nodeType.includes('action')) {
    return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 text-xs sm:text-sm">Action</Badge>
  }
  if (nodeType.includes('ai') || nodeType.includes('agent')) {
    return <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200 text-xs sm:text-sm">AI</Badge>
  }
  return <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-gray-200 text-xs sm:text-sm">Node</Badge>
}

/**
 * Modal component for configuring workflow nodes
 */
export function ConfigurationModal({
  isOpen,
  onClose,
  onSave,
  onBack,
  nodeInfo,
  integrationName,
  initialData = {},
  workflowData,
  currentNodeId,
  nodeTitle,
  isTemplateEditing = false,
  templateDefaults,
  focusField,
}: ConfigurationModalProps) {
  // Debug: Log initialData when modal opens
  useEffect(() => {
    if (isOpen) {
      logger.debug('🎯 [ConfigModal] Modal opened with initialData:', {
        currentNodeId,
        nodeType: nodeInfo?.type,
        initialData,
        hasGuildId: !!initialData?.guildId,
        hasChannelId: !!initialData?.channelId,
        hasMessage: !!initialData?.message,
        allKeys: Object.keys(initialData || {})
      });
    }
  }, [isOpen, initialData, currentNodeId, nodeInfo?.type]);

  // Track node type to prevent unnecessary re-renders
  const prevNodeTypeRef = React.useRef(nodeInfo?.type);

  // Track node type changes
  if (prevNodeTypeRef.current !== nodeInfo?.type) {
    prevNodeTypeRef.current = nodeInfo?.type;
  }

  // Check if this node is connected to an AI Agent
  const isConnectedToAIAgent = React.useMemo(() => {
    if (!workflowData?.edges || !workflowData?.nodes || !currentNodeId) return false;
    
    // Check if the current node has a parent AI Agent
    const parentEdges = workflowData.edges.filter((edge: any) => edge.target === currentNodeId);
    
    for (const edge of parentEdges) {
      const sourceNode = workflowData.nodes.find((node: any) => node.id === edge.source);
      if (sourceNode?.data?.type === 'ai_agent' || sourceNode?.data?.type === 'ai_message') {
        return true;
      }
    }
    
    // Also check if this node has parentAIAgentId in its data (for AI-generated workflows)
    const currentNode = workflowData.nodes.find((node: any) => node.id === currentNodeId);
    if (currentNode?.data?.parentAIAgentId) {
      logger.debug('🤖 [ConfigModal] Node has parentAIAgentId:', currentNode.data.parentAIAgentId);
      return true;
    }
    
    return false;
  }, [workflowData, currentNodeId]);

  const { toast } = useToast();
  const [initialOverride, setInitialOverride] = useState<Record<string, any> | null>(null)
  const [formSeedVersion, setFormSeedVersion] = useState(0)
  const [activeTab, setActiveTab] = useState<'setup' | 'advanced' | 'results'>('setup')

  // Viewport dimensions for panel height calculation (to sit below header)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)

  // Set viewport dimensions after mount to avoid SSR/client mismatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setViewportHeight(window.innerHeight)
      setViewportWidth(window.innerWidth)

      const handleResize = () => {
        setViewportHeight(window.innerHeight)
        setViewportWidth(window.innerWidth)
      }
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Only reset form when the node ID changes, not when initialData object reference changes
  // This prevents form resets when selecting fields (which can trigger re-renders with new initialData objects)
  const prevNodeIdRef = useRef(currentNodeId)
  const prevIsOpenRef = useRef(isOpen)
  useEffect(() => {
    // Reset when node ID changes
    if (prevNodeIdRef.current !== currentNodeId) {
      prevNodeIdRef.current = currentNodeId
      setInitialOverride(null)
      setFormSeedVersion(0)
    }

    // Reset when modal opens (to show fresh data from initialData)
    // This ensures saved config is displayed when reopening
    if (!prevIsOpenRef.current && isOpen) {
      setInitialOverride(null)
      setFormSeedVersion(prev => prev + 1) // Increment to force form remount with new data
    }

    prevIsOpenRef.current = isOpen
  }, [currentNodeId, isOpen])

  const effectiveInitialData = React.useMemo(
    () => initialOverride ?? initialData ?? {},
    [initialOverride, initialData]
  )

  // Detect if this is a reopen (has existing config) vs fresh open (empty config)
  // When reopening, we suppress all loading placeholders and show saved values instantly
  const isReopen = React.useMemo(() => {
    if (!effectiveInitialData) return false;

    // Check if there are any actual config values (excluding metadata keys)
    // IMPORTANT: Also exclude fields that start with "airtable_field_" + "_labels" suffix
    const configKeys = Object.keys(effectiveInitialData).filter(key =>
      !key.startsWith('__') && // Exclude __dynamicOptions, __validationState, etc.
      !key.endsWith('_labels') && // Exclude airtable_field_X_labels
      key !== 'workflowId'      // Exclude workflowId (always present)
    );

    const isReopenValue = configKeys.length > 0;
    console.log('🔍 [ConfigModal] isReopen check:', {
      isReopenValue,
      configKeys,
      allKeys: Object.keys(effectiveInitialData || {})
    });

    return isReopenValue;
  }, [effectiveInitialData])

  const autoMappingEntries = React.useMemo(
    () =>
      computeAutoMappingEntries({
        workflowData,
        currentNodeId,
        configSchema: nodeInfo?.configSchema || [],
        currentConfig: effectiveInitialData,
      }),
    [workflowData, currentNodeId, nodeInfo?.configSchema, effectiveInitialData]
  )

  const validationState = effectiveInitialData?.__validationState
  const showValidationAlert = React.useMemo(() => {
    if (!validationState) return false
    if (validationState.isValid === false) return true
    return Boolean(validationState.missingRequired && validationState.missingRequired.length > 0)
  }, [validationState])

  const handleApplyAutoMappings = useCallback(() => {
    if (!autoMappingEntries.length) {
      toast({
        title: "Nothing to apply",
        description: "All suggested fields already have values.",
      })
      return
    }

    const nextConfig = { ...effectiveInitialData }
    let changed = false

    autoMappingEntries.forEach(({ fieldKey, value }) => {
      const existing = nextConfig[fieldKey]
      const hasValue =
        existing !== undefined && existing !== null && String(existing).trim() !== ""
      if (hasValue) return
      nextConfig[fieldKey] = value
      changed = true
    })

    if (!changed) {
      toast({
        title: "Nothing to apply",
        description: "All suggested fields already have values.",
      })
      return
    }

    setInitialOverride(nextConfig)
    setFormSeedVersion((prev) => prev + 1)
    toast({
      title: "Configuration updated",
      description: "Suggested field mappings were added to the form.",
    })
  }, [autoMappingEntries, effectiveInitialData, toast])

  // State for test node functionality
  const [isTestingNode, setIsTestingNode] = useState(false)

  // Handler for testing the node
  const handleTestNode = useCallback(async () => {
    if (!nodeInfo?.type) {
      toast({
        title: "Cannot test node",
        description: "Node type is not defined",
        variant: "destructive"
      })
      return
    }

    setIsTestingNode(true)
    setActiveTab('results') // Switch to results tab to show progress

    try {
      // Strip out test metadata before sending to API
      const cleanConfig = Object.keys(effectiveInitialData).reduce((acc, key) => {
        if (!key.startsWith('__test') && !key.startsWith('__validation')) {
          acc[key] = effectiveInitialData[key]
        }
        return acc
      }, {} as Record<string, any>)

      logger.debug('[ConfigModal] Testing node:', {
        nodeType: nodeInfo.type,
        config: cleanConfig,
        strippedKeys: Object.keys(effectiveInitialData).filter(k => k.startsWith('__test'))
      })

      const response = await fetch('/api/workflows/test-node', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeType: nodeInfo.type,
          config: cleanConfig,
          testData: {}
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to test node')
      }

      logger.debug('[ConfigModal] Test completed:', result)

      // Update the config with test results
      const updatedConfig = {
        ...effectiveInitialData,
        __testData: result.testResult?.output || {},
        __testResult: {
          success: result.testResult?.success !== false,
          executionTime: result.testResult?.executionTime,
          timestamp: new Date().toISOString(),
          error: result.testResult?.error,
          message: result.testResult?.message,
          rawResponse: result.testResult?.output
        }
      }

      setInitialOverride(updatedConfig)
      setFormSeedVersion((prev) => prev + 1)

      toast({
        title: result.testResult?.success !== false ? "Test passed" : "Test failed",
        description: result.testResult?.message || "Node executed successfully",
        variant: result.testResult?.success !== false ? "default" : "destructive"
      })

    } catch (error: any) {
      logger.error('[ConfigModal] Test failed:', error)

      // Update with error state
      const errorConfig = {
        ...effectiveInitialData,
        __testData: {},
        __testResult: {
          success: false,
          timestamp: new Date().toISOString(),
          error: error.message || 'Test execution failed',
          message: error.message || 'Test execution failed'
        }
      }

      setInitialOverride(errorConfig)
      setFormSeedVersion((prev) => prev + 1)

      toast({
        title: "Test failed",
        description: error.message || "Failed to execute test",
        variant: "destructive"
      })
    } finally {
      setIsTestingNode(false)
    }
  }, [nodeInfo, effectiveInitialData, toast])

  const getRouterChainHints = useCallback(() => {
    if (!workflowData || !currentNodeId) return [] as string[];

    const nodes = workflowData.nodes ?? [];
    const edges = workflowData.edges ?? [];
    const seen = new Set<string>();
    const chains: string[] = [];

    edges
      .filter((edge: any) => edge.source === currentNodeId)
      .forEach((edge: any) => {
        if (seen.has(edge.target)) return;
        seen.add(edge.target);

        const targetNode = nodes.find((n: any) => n.id === edge.target);
        const label =
          edge.sourceHandle ||
          targetNode?.data?.title ||
          targetNode?.data?.label ||
          targetNode?.data?.type ||
          targetNode?.title ||
          edge.target;

        chains.push(label);
      });

    return chains;
  }, [workflowData, currentNodeId]);
  
  // For Trello-specific debugging (can be removed when Trello integration is stable)
  if (nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") {
    logger.debug("🔍 TRELLO CONFIG MODAL DEBUG:", {
      nodeType: nodeInfo.type,
      providerId: nodeInfo.providerId,
      configSchemaLength: nodeInfo.configSchema?.length || 0,
      isModalOpen: isOpen
    });
  }

  // Handle form submission
  const handleSubmit = async (configData: Record<string, any>) => {
    try {
      const {
        __dynamicOptions,
        __validationState,
        ...config
      } = configData.config || configData;
      
      // Log attachment fields for Gmail send email
      if (nodeInfo?.type === 'gmail_action_send_email') {
        logger.debug('📎 [ConfigurationModal] Gmail send email config being saved:', {
          sourceType: config.sourceType,
          hasUploadedFiles: !!config.uploadedFiles,
          hasFileUrl: !!config.fileUrl,
          hasFileFromNode: !!config.fileFromNode,
          hasAttachments: !!config.attachments,
          configKeys: Object.keys(config || {})
        });
      }
      
      await onSave({
        ...config,
        __dynamicOptions,
        __validationState
      });

      if (nodeInfo?.type === 'ai_router') {
        const outputPaths = Array.isArray(config?.outputPaths) ? config.outputPaths : []
        const unlinkedPaths = outputPaths.filter((path: any) => !path?.chainId)

        if (unlinkedPaths.length > 0) {
          const chainHints = getRouterChainHints()
          const pathNames = unlinkedPaths.map((path: any) => path?.name || path?.id || 'Unnamed path')

          toast({
            title: chainHints.length > 0 ? 'Link router paths to chains' : 'Next: add chains for your router',
            description: chainHints.length > 0
              ? `Select a chain for ${pathNames.join(', ')} so the router can execute it automatically.`
              : 'Use the router\'s output handles in the canvas to add chains, then reopen this modal to link them.',
          })
        }
      }
      onClose(true);
    } catch (error) {
      logger.error('Failed to save configuration:', error);
      // Don't close the modal if save failed - let the user see the error and retry
    }
  };

  // Handle close
  const handleClose = () => {
    onClose(false);
  };

  // Generate title for the modal
  const getModalTitle = () => {
    if (!nodeInfo) return "Configure Node";

    const trimmedCustomTitle = typeof nodeTitle === 'string' ? nodeTitle.trim() : ''

    // Priority 1: Use custom nodeTitle if provided
    if (trimmedCustomTitle) return trimmedCustomTitle;

    // Priority 2: Use nodeInfo.title (e.g., "Create Issue", "Send Email")
    if ((nodeInfo as any).title) {
      return (nodeInfo as any).title;
    }

    // Priority 3: Use nodeInfo.label if available
    if ((nodeInfo as any).label) {
      return (nodeInfo as any).label;
    }

    // Priority 4: Format the node type nicely
    let title = nodeInfo.type || "Configure Node";

    // Clean up title if needed
    if (title.includes("_action_")) {
      title = title
        .replace(/_action_/g, " ")
        .replace(/_/g, " ")
        .split(" ")
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }

    if (title.includes("_trigger_")) {
      title = title
        .replace(/_trigger_/g, " ")
        .replace(/_/g, " ")
        .split(" ")
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }

    return title;
  };

  const dialogContentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen || !focusField) return

    const timer = setTimeout(() => {
      const root = dialogContentRef.current
      if (!root) return
      const fieldElement = root.querySelector(`[data-config-field="${focusField}"]`)
      if (fieldElement) {
        fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const focusable = fieldElement.querySelector<HTMLElement>('input, textarea, select, [contenteditable="true"]')
        focusable?.focus()
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [isOpen, focusField])

  // Header height (BuilderHeader is h-12 = 48px tall)
  const headerHeight = 48
  const panelHeight = viewportHeight > 0 ? viewportHeight - headerHeight : undefined

  return (
    <TooltipProvider>
      <VariableDragProvider>
        {/* Configuration Panel */}
        <div
          ref={dialogContentRef}
          className={`fixed right-0 bg-white dark:bg-slate-950 border-l border-border z-40 overflow-hidden ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        style={{
          transition: 'transform 700ms cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: isOpen ? 'auto' : 'transform', // Only use will-change during animation
          transform: 'translateZ(0)', // Force GPU acceleration for smooth rendering
          backfaceVisibility: 'hidden', // Prevent flickering during scroll
          top: `${headerHeight}px`,
          width: viewportWidth === 0 ? '90vw' : viewportWidth < 640 ? '100vw' : viewportWidth < 1024 ? '95vw' : '90vw',
          maxWidth: viewportWidth === 0 ? '1200px' : viewportWidth < 640 ? '100vw' : '1200px',
          height: panelHeight ? `${panelHeight}px` : `calc(100vh - ${headerHeight}px)`,
          maxHeight: panelHeight ? `${panelHeight}px` : `calc(100vh - ${headerHeight}px)`,
        }}
        onDragOver={(e) => {
          e.preventDefault();
          logger.debug('🔵 [ConfigPanel] Allowing drag over in panel');
        }}>
        {/* Modal Container - Split Layout */}
        <div
          className="modal-container flex flex-col lg:flex-row h-full overflow-hidden"
          onMouseDown={(e) => {
            // Prevent text selection in modal background but allow in form elements or draggable elements
            const target = e.target as HTMLElement;
            const isFormElement = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) ||
                                 target.closest('input, textarea, select, button, [contenteditable="true"]');
            const isDraggable = target.closest('[draggable="true"]');
            if (!isFormElement && !isDraggable) {
              e.preventDefault();
            }
          }}>
          {/* Main Configuration Area - Left Column */}
          <div className="modal-main-column config-content-area flex flex-col flex-1 min-w-0 max-w-full overflow-hidden" style={{ isolation: 'isolate' }}>
            {/* Panel Header */}
            <div className="pb-3 border-b border-border/30 px-4 pt-3 flex-shrink-0 bg-white dark:bg-slate-950">
              <div className="flex items-center gap-3">
                {/* Close Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="flex-shrink-0 h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ArrowRight className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                </Button>

                {/* Integration Logo or Node-specific Icon */}
                <div className="flex-shrink-0">
                  {renderNodeBadge(nodeInfo || undefined)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 truncate">
                    {getModalTitle()}
                    {getNodeTypeBadge(nodeInfo?.type || '')}
                  </h2>
                  {/* Hide description for nodes that manage their own headers */}
                  {!['extract_website_data', 'format_transformer', 'parse_file', 'internet_search'].includes(nodeInfo?.type || '') && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                      {(nodeInfo as any)?.description || (nodeInfo?.providerId
                        ? `Configure your ${getProviderBrandName(nodeInfo.providerId)} integration settings`
                        : 'Configure your workflow node settings')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {nodeInfo && (
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="flex-1 flex flex-col min-h-0 overflow-hidden max-w-full">
                {/* Tab Navigation - Minimal Underline Style */}
                <TabsList className="px-4 pt-3 border-b border-border bg-transparent w-full flex justify-start gap-0 rounded-none h-auto">
                  <TabsTrigger
                    value="setup"
                    className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none bg-transparent hover:bg-muted/50 transition-colors px-5 py-3 text-sm font-medium text-muted-foreground"
                  >
                    <Wrench className="h-4 w-4" />
                    Setup
                  </TabsTrigger>
                  <TabsTrigger
                    value="advanced"
                    className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none bg-transparent hover:bg-muted/50 transition-colors px-5 py-3 text-sm font-medium text-muted-foreground"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Advanced
                  </TabsTrigger>
                  <TabsTrigger
                    value="results"
                    className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none bg-transparent hover:bg-muted/50 transition-colors px-5 py-3 text-sm font-medium text-muted-foreground"
                  >
                    <TestTube2 className="h-4 w-4" />
                    Results
                  </TabsTrigger>
                </TabsList>

                {/* Setup Tab Content */}
                <TabsContent value="setup" className="flex-1 flex flex-col min-h-0 overflow-hidden max-w-full m-0 mt-0">
                  {(showValidationAlert || autoMappingEntries.length > 0) && (
                    <div className="px-4 pt-4 space-y-3">
                      {showValidationAlert && (
                        <Alert variant="destructive">
                          <AlertTitle>Configuration needs attention</AlertTitle>
                          <AlertDescription>
                            Please review the required fields highlighted in the form below.
                          </AlertDescription>
                        </Alert>
                      )}
                      {autoMappingEntries.length > 0 && (
                        <Alert>
                          <AlertTitle>Suggested field mappings</AlertTitle>
                          <AlertDescription className="space-y-2">
                            <p className="text-sm text-slate-600">
                              We found matching data from earlier steps for the following empty fields.
                            </p>
                            <ul className="space-y-1 text-sm text-slate-600">
                              {autoMappingEntries.map((entry) => (
                                <li key={entry.fieldKey} className="flex flex-wrap items-center gap-2">
                                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                                    {entry.fieldKey}
                                  </code>
                                  <span className="text-xs text-slate-400">←</span>
                                  <span className="font-mono text-xs text-slate-700">
                                    {entry.value}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="inline-flex items-center gap-2"
                              onClick={handleApplyAutoMappings}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              Fill fields automatically
                            </Button>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  <ConfigurationDataInspector
                    workflowData={workflowData}
                    currentNodeId={currentNodeId}
                  />

                  <SetupTab
                    key={`${currentNodeId}-${nodeInfo?.type}-${formSeedVersion}`}
                    nodeInfo={nodeInfo}
                    initialData={effectiveInitialData}
                    onSave={handleSubmit}
                    onCancel={handleClose}
                    onBack={onBack}
                    workflowData={workflowData}
                    currentNodeId={currentNodeId}
                    integrationName={integrationName}
                    isConnectedToAIAgent={isConnectedToAIAgent}
                    isTemplateEditing={isTemplateEditing}
                    templateDefaults={templateDefaults}
                    isReopen={isReopen}
                  />
                </TabsContent>

                {/* Advanced Tab Content */}
                <TabsContent value="advanced" className="flex-1 min-h-0 overflow-hidden mt-0 p-0">
                  <AdvancedTab
                    nodeInfo={nodeInfo}
                    currentNodeId={currentNodeId}
                    workflowData={workflowData}
                    initialPolicy={effectiveInitialData?.__policy}
                    initialMetadata={effectiveInitialData?.__metadata}
                    onChange={(data) => {
                      // Store advanced settings in initial data for saving
                      // This will be included when onSave is called
                    }}
                  />
                </TabsContent>

                {/* Results Tab Content */}
                <TabsContent value="results" className="flex-1 min-h-0 overflow-hidden mt-0 p-0">
                  <ResultsTab
                    nodeInfo={nodeInfo}
                    currentNodeId={currentNodeId}
                    testData={effectiveInitialData?.__testData}
                    testResult={effectiveInitialData?.__testResult}
                    onRunTest={handleTestNode}
                    isTestingNode={isTestingNode}
                  />
                </TabsContent>
              </Tabs>
            )}
          </div>

        </div>
      </div>
      </VariableDragProvider>
    </TooltipProvider>
  );
}
