"use client"

import React, { useEffect, useRef } from 'react';
import { GenericConfiguration } from './GenericConfiguration';

import { logger } from '@/lib/utils/logger'

interface GoogleCalendarConfigurationProps {
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

export function GoogleCalendarConfiguration(props: GoogleCalendarConfigurationProps) {
  const {
    nodeInfo,
    loadOptions,
    needsConnection
  } = props;

  const hasRequestedCalendarsRef = useRef(false);

  useEffect(() => {
    hasRequestedCalendarsRef.current = false;
  }, [nodeInfo?.id, nodeInfo?.type, nodeInfo?.providerId, needsConnection]);

  // Ensure calendar options load immediately when the configuration opens
  useEffect(() => {
    if (needsConnection) return;
    if (nodeInfo?.providerId !== 'google-calendar') return;
    if (hasRequestedCalendarsRef.current) return;

    const schema = nodeInfo?.configSchema;
    if (!schema) return;

    const hasCalendarsField = schema.some(
      (field: any) => field.name === 'calendars' && field.dynamic
    );

    if (!hasCalendarsField) return;

    let isMounted = true;

    const loadCalendars = async () => {
      try {
        hasRequestedCalendarsRef.current = true;
        await loadOptions('calendars', undefined, undefined, true);
      } catch (error) {
        logger.error('[GoogleCalendarConfiguration] Failed to preload calendars', error);
        if (isMounted) {
          hasRequestedCalendarsRef.current = false;
        }
      }
    };

    loadCalendars();

    return () => {
      isMounted = false;
    };
  }, [loadOptions, needsConnection, nodeInfo?.id, nodeInfo?.type, nodeInfo?.providerId]);

  return <GenericConfiguration {...props} />;
}
