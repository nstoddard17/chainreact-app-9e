"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ConfigurationModalProps } from "./utils/types"
import ConfigurationForm from "./ConfigurationForm"
import { VariablePickerSidePanel } from "./VariablePickerSidePanel"
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
  nodeInfo,
  integrationName,
  initialData = {},
  workflowData,
  currentNodeId,
}: ConfigurationModalProps) {
  // Debug logging (can be removed in production)
  if (process.env.NODE_ENV !== "production") {
    console.log("🔍 ConfigurationModal rendered:", {
      isOpen,
      nodeType: nodeInfo?.type,
      integrationName
    });
  }
  
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
      // Extract config from the data structure passed by ConfigurationForm
      const config = configData.config || configData;
      await onSave(config);
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
    
    let title = (nodeInfo as any).label || (nodeInfo as any).title || nodeInfo.type || "Configure Node";
    
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
      <CustomDialogContent className="bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl">
        <div className="flex h-full max-h-[95vh]">
          {/* Main Configuration Area - Fixed width to prevent Variables panel from being pushed off */}
          <div className="flex flex-col" style={{ width: workflowData && !nodeInfo?.isTrigger ? 'calc(100% - 320px)' : '100%' }}>
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
                    {integrationName && (
                      <p className="text-sm text-slate-600 mt-1">
                        {integrationName} Integration
                      </p>
                    )}
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
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <ConfigurationForm
                  nodeInfo={nodeInfo}
                  initialData={initialData}
                  onSubmit={handleSubmit}
                  onCancel={handleClose}
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  integrationName={integrationName}
                />
              </div>
            )}
          </div>

          {/* Variable Picker Side Panel - Fixed position, always visible */}
          {workflowData && !nodeInfo?.isTrigger && (
            <div className="w-80 flex-shrink-0">
              <VariablePickerSidePanel
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                currentNodeType={nodeInfo?.type}
              />
            </div>
          )}
        </div>
      </CustomDialogContent>
    </Dialog>
  );
}