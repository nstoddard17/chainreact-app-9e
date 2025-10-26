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
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ConfigurationModalProps } from "./utils/types"
import ConfigurationForm from "./ConfigurationForm"
import { ConfigurationDataInspector } from "./ConfigurationDataInspector"
import { VariablePickerSidePanel } from "./VariablePickerSidePanel"
import { VariableDragProvider } from "./VariableDragContext"
import { Settings, Zap, Bot, MessageSquare, Mail, Calendar, FileText, Database, Globe, Shield, Bell, ChevronLeft, ChevronRight, ArrowLeft, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { computeAutoMappingEntries } from "./autoMapping"

import { logger } from '@/lib/utils/logger'

/**
 * Custom DialogContent without built-in close button
 */
const CustomDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed right-0 top-0 z-50 h-full w-[90vw] max-w-[1200px] gap-0 border-l bg-background p-0 shadow-2xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right overflow-hidden",
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        logger.debug('🔵 [Dialog] Allowing drag over in dialog');
      }}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
CustomDialogContent.displayName = DialogPrimitive.Content.displayName

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

/**
 * Get icon for node type
 */
const getNodeIcon = (nodeType: string) => {
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
  const [isVariablePanelOpen, setIsVariablePanelOpen] = useState(false);
  const [initialOverride, setInitialOverride] = useState<Record<string, any> | null>(null)
  const [formSeedVersion, setFormSeedVersion] = useState(0)

  useEffect(() => {
    setInitialOverride(null)
    setFormSeedVersion(0)
  }, [initialData, currentNodeId])

  const effectiveInitialData = React.useMemo(
    () => initialOverride ?? initialData ?? {},
    [initialOverride, initialData]
  )

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

    let title = trimmedCustomTitle || (nodeInfo as any).label || (nodeInfo as any).title || nodeInfo.type || "Configure Node";
    
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <VariableDragProvider>
        <CustomDialogContent
          ref={dialogContentRef}
          className="bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl"
          onPointerDownOutside={(e) => {
            // Prevent dialog from closing when clicking outside if there are form elements
            const target = e.target as HTMLElement;
            if (target.closest('input, textarea, select')) {
              e.preventDefault();
            }
          }}>
        {/* Modal Container - Split Layout */}
        <div
          className="modal-container flex flex-col lg:flex-row h-full max-h-[95vh] overflow-hidden"
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
            <DialogHeader className="pb-3 border-b border-slate-200 px-4 pt-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8 flex-shrink-0">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-1.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white flex-shrink-0">
                    {React.cloneElement(getNodeIcon(nodeInfo?.type || ''), { className: 'h-5 w-5' })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2 truncate">
                      {getModalTitle()}
                      {getNodeTypeBadge(nodeInfo?.type || '')}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-600 mt-0.5 truncate">
                      {integrationName ? `Configure your ${integrationName} integration settings` : 'Configure your workflow node settings'}
                    </DialogDescription>
                  </div>
                </div>
              </div>
            </DialogHeader>

            {nodeInfo && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden max-w-full">
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

                <ConfigurationForm
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
                />
              </div>
            )}
          </div>

          {/* Variable Picker Side Panel - Desktop: Right Column, Tablet: Slide-in */}
          {workflowData && !nodeInfo?.isTrigger && (
            <>
              {/* Desktop view - always visible */}
              <div className="modal-sidebar-column variable-picker-area hidden lg:flex w-80 xl:w-96 flex-shrink-0 border-l border-slate-200 h-full overflow-hidden" style={{ isolation: 'isolate' }}>
                <VariablePickerSidePanel
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  currentNodeType={nodeInfo?.type}
                  workflowId={workflowData?.id}
                />
              </div>

              {/* Tablet/Mobile: Toggle button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsVariablePanelOpen(!isVariablePanelOpen)}
                className="lg:hidden fixed right-0 top-1/2 -translate-y-1/2 z-50 bg-blue-500 hover:bg-blue-600 text-white rounded-l-lg rounded-r-none px-2 py-6 shadow-lg"
              >
                {isVariablePanelOpen ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </Button>

              {/* Tablet/Mobile: Slide-in panel */}
              <div
                className={cn(
                  "lg:hidden fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-40 transition-transform duration-300 ease-in-out",
                  isVariablePanelOpen ? "translate-x-0" : "translate-x-full"
                )}
              >
                <VariablePickerSidePanel
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  currentNodeType={nodeInfo?.type}
                  workflowId={workflowData?.id}
                />
              </div>

              {/* Overlay for tablet/mobile when panel is open */}
              {isVariablePanelOpen && (
                <div
                  className="lg:hidden fixed inset-0 bg-black/50 z-30"
                  onClick={() => setIsVariablePanelOpen(false)}
                />
              )}
            </>
          )}
        </div>
      </CustomDialogContent>
      </VariableDragProvider>
    </Dialog>
  );
}
