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

import React, { useState, useEffect, useRef } from "react"
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ConfigurationModalProps } from "./utils/types"
import ConfigurationForm from "./ConfigurationForm"
import { VariablePickerSidePanel } from "./VariablePickerSidePanel"
import { VariableDragProvider } from "./VariableDragContext"
import { Settings, Zap, Bot, MessageSquare, Mail, Calendar, FileText, Database, Globe, Shield, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

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
        "fixed left-1/2 top-1/2 z-50 w-[98vw] h-[95vh] max-w-[98vw] md:max-w-[95vw] lg:max-w-[92vw] xl:max-w-[88vw] 2xl:max-w-[1600px] max-h-[95vh] translate-x-[-50%] translate-y-[-50%] gap-0 border bg-background p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden",
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        console.log('🔵 [Dialog] Allowing drag over in dialog');
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
    return <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">Trigger</Badge>
  }
  if (nodeType.includes('action')) {
    return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">Action</Badge>
  }
  if (nodeType.includes('ai') || nodeType.includes('agent')) {
    return <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200">AI</Badge>
  }
  return <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-gray-200">Node</Badge>
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
}: ConfigurationModalProps) {
  // Debug: Log initialData when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('🎯 [ConfigModal] Modal opened with initialData:', {
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
      console.log('🤖 [ConfigModal] Node has parentAIAgentId:', currentNode.data.parentAIAgentId);
      return true;
    }
    
    return false;
  }, [workflowData, currentNodeId]);
  
  // For Trello-specific debugging (can be removed when Trello integration is stable)
  if (nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") {
    console.log("🔍 TRELLO CONFIG MODAL DEBUG:", {
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
        console.log('📎 [ConfigurationModal] Gmail send email config being saved:', {
          sourceType: config.sourceType,
          uploadedFiles: config.uploadedFiles,
          fileUrl: config.fileUrl,
          fileFromNode: config.fileFromNode,
          attachments: config.attachments,
          fullConfig: JSON.stringify(config, null, 2)
        });
      }
      
      await onSave({
        ...config,
        __dynamicOptions,
        __validationState
      });
      onClose(true);
    } catch (error) {
      console.error('Failed to save configuration:', error);
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <VariableDragProvider>
        <CustomDialogContent
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
            <DialogHeader className="pb-3 border-b border-slate-200 px-6 pt-6 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white">
                    {getNodeIcon(nodeInfo?.type || '')}
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                      {getModalTitle()}
                      {getNodeTypeBadge(nodeInfo?.type || '')}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-600 mt-1">
                      {integrationName ? `Configure your ${integrationName} integration settings` : 'Configure your workflow node settings'}
                    </DialogDescription>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 rounded-full transition-all duration-200 group"
                >
                  <svg className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
            </DialogHeader>
            
            {nodeInfo && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden max-w-full">
                <ConfigurationForm
                  key={`${currentNodeId}-${nodeInfo?.type}-${nodeInfo?.id}`}
                  nodeInfo={nodeInfo}
                  initialData={initialData}
                  onSave={handleSubmit}
                  onCancel={handleClose}
                  onBack={onBack}
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  integrationName={integrationName}
                  isConnectedToAIAgent={isConnectedToAIAgent}
                />
              </div>
            )}
          </div>

          {/* Variable Picker Side Panel - Right Column */}
          {workflowData && !nodeInfo?.isTrigger && (
            <div className="modal-sidebar-column variable-picker-area w-full lg:w-80 xl:w-96 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 h-full overflow-hidden" style={{ isolation: 'isolate' }}>
              <VariablePickerSidePanel
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                currentNodeType={nodeInfo?.type}
              />
            </div>
          )}
        </div>
      </CustomDialogContent>
      </VariableDragProvider>
    </Dialog>
  );
}
