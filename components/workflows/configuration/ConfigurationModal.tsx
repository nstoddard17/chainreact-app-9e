"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfigurationModalProps } from "./utils/types"
import ConfigurationForm from "./ConfigurationForm"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

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
  const handleSubmit = (config: Record<string, any>) => {
    onSave(config);
    onClose(true);
  };

  // Handle close
  const handleClose = () => {
    onClose(false);
  };

  // Generate title for the modal
  const getModalTitle = () => {
    if (!nodeInfo) return "Configure Node";
    
    let title = nodeInfo.label || nodeInfo.type || "Configure Node";
    
    // Clean up title if needed
    if (title.includes("_action_")) {
      title = title
        .replace(/_action_/g, " ")
        .replace(/_/g, " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
    
    // Add integration name if available
    if (integrationName) {
      title = `${integrationName} - ${title}`;
    }
    
    return title;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {getModalTitle()}
          </DialogTitle>
        </DialogHeader>
        
        {nodeInfo && (
          <ConfigurationForm
            nodeInfo={nodeInfo}
            initialData={initialData}
            onSubmit={handleSubmit}
            onCancel={handleClose}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            integrationName={integrationName}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}