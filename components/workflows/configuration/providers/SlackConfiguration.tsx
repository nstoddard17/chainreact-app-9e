"use client"

import React from 'react';
import { GenericConfiguration } from './GenericConfiguration';

// Slack-specific extended configuration (if needed in the future)
export const SLACK_EXTENDED_CONFIG = {
  // Add Slack-specific UI configuration here when needed
};

interface SlackConfigurationProps {
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

export function SlackConfiguration(props: SlackConfigurationProps) {
  // Slack currently uses the generic configuration
  // This wrapper allows for future Slack-specific customizations
  return <GenericConfiguration {...props} />;
}