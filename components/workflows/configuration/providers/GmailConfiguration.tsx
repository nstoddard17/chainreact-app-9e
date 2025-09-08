"use client"

import React from 'react';
import { GenericConfiguration } from './GenericConfiguration';

// Gmail-specific extended configuration (if needed in the future)
// This can include custom UI settings, special handlers, etc.
export const GMAIL_EXTENDED_CONFIG = {
  // Add Gmail-specific UI configuration here when needed
  // For example: custom field validators, special UI behaviors, etc.
};

interface GmailConfigurationProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (field: string, value: any) => void;
  errors: Record<string, string>;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  onBack?: () => void;
  isEditMode?: boolean;
  workflowData?: any;
  currentNodeId?: string;
  dynamicOptions: Record<string, any[]>;
  loadingDynamic: boolean;
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean) => Promise<void>;
  integrationName?: string;
  needsConnection?: boolean;
  onConnectIntegration?: () => void;
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
  isConnectedToAIAgent?: boolean;
  loadingFields?: Set<string>;
}

export function GmailConfiguration(props: GmailConfigurationProps) {
  // Gmail currently uses the generic configuration
  // This wrapper allows for future Gmail-specific customizations
  return <GenericConfiguration {...props} />;
}