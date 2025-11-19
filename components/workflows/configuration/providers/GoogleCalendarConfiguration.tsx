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
    needsConnection,
    values,
    setValue
  } = props;

  const hasRequestedCalendarsRef = useRef(false);
  const prevAllDayRef = useRef<boolean | undefined>(undefined);

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

  // Handle allDay toggle - update notifications and transparency defaults
  useEffect(() => {
    const currentAllDay = values?.allDay;

    // Only update if allDay value has changed
    if (prevAllDayRef.current !== currentAllDay) {
      prevAllDayRef.current = currentAllDay;

      // Only update on actual toggle, not initial load
      if (prevAllDayRef.current !== undefined) {
        if (currentAllDay === true) {
          // Switched to all-day event
          // Update notifications to Google's default: 1 day before at 9:00 AM
          // 1 day = 1440 minutes, time = 09:00
          setValue('notifications', [{ method: 'popup', minutes: 1440, time: '09:00' }]);

          // Update transparency to "Free" for all-day events
          setValue('transparency', 'transparent');

          logger.debug('🔄 [GoogleCalendar] Switched to all-day event - updated notifications to 1 day before at 9:00 AM and transparency to free');
        } else if (currentAllDay === false) {
          // Switched to timed event
          // Update notifications to 30 minutes before (no time field for timed events)
          setValue('notifications', [{ method: 'popup', minutes: 30 }]);

          // Update transparency to "Busy" for timed events
          setValue('transparency', 'opaque');

          logger.debug('🔄 [GoogleCalendar] Switched to timed event - updated notifications to 30 minutes before and transparency to busy');
        }
      }
    }
  }, [values?.allDay, setValue]);

  return <GenericConfiguration {...props} />;
}
