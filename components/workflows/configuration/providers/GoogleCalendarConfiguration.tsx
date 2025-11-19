"use client"

import React, { useEffect, useRef } from 'react';
import { GenericConfiguration } from './GenericConfiguration';

import { logger } from '@/lib/utils/logger'
import { getCurrentMinutes, minutesToTimeString, normalizeMinutes, roundMinutesToInterval, timeStringToMinutes } from '@/lib/utils/time';

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

const DEFAULT_EVENT_DURATION_MINUTES = 60;
const DEFAULT_NOTIFICATION_MINUTES = 30;
const getDefaultNotifications = () => [{ method: 'popup', minutes: DEFAULT_NOTIFICATION_MINUTES }];

export function GoogleCalendarConfiguration(props: GoogleCalendarConfigurationProps) {
  const {
    nodeInfo,
    loadOptions,
    needsConnection,
    values,
    setValue,
    isEditMode
  } = props;

  const hasRequestedCalendarsRef = useRef(false);
  const prevAllDayRef = useRef<boolean | undefined>(undefined);
  const eventDurationRef = useRef(DEFAULT_EVENT_DURATION_MINUTES);
  const hasCustomDurationRef = useRef(false);
  const autoUpdatingEndRef = useRef(false);
  const initialDurationSyncedRef = useRef(false);
  const hasSetInitialTimesRef = useRef(false);

  useEffect(() => {
    hasRequestedCalendarsRef.current = false;
  }, [nodeInfo?.id, nodeInfo?.type, nodeInfo?.providerId, needsConnection]);

  useEffect(() => {
    eventDurationRef.current = DEFAULT_EVENT_DURATION_MINUTES;
    hasCustomDurationRef.current = false;
    autoUpdatingEndRef.current = false;
    initialDurationSyncedRef.current = false;
    hasSetInitialTimesRef.current = false;
  }, [nodeInfo?.id, nodeInfo?.type]);

  // Always set times when modal opens (unless in edit mode with saved values)
  useEffect(() => {
    if (hasSetInitialTimesRef.current) return;

    // Calculate current time rounded to nearest 15 minutes
    const roundedStartMinutes = roundMinutesToInterval(getCurrentMinutes(), 15, "nearest");
    const startValue = minutesToTimeString(roundedStartMinutes);
    const endValue = minutesToTimeString(
      normalizeMinutes(roundedStartMinutes + DEFAULT_EVENT_DURATION_MINUTES)
    );

    // Always set times when opening modal (unless already set in edit mode)
    if (!isEditMode || !values?.startTime) {
      setValue('startTime', startValue);
      setValue('endTime', endValue);
    }

    // Set default notifications if not present
    if (!Array.isArray(values?.notifications) || values.notifications.length === 0) {
      setValue('notifications', getDefaultNotifications());
    }

    hasSetInitialTimesRef.current = true;
  }, [setValue, isEditMode]);

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
        const defaultNotifications = getDefaultNotifications();

        if (currentAllDay === true) {
          setValue('notifications', defaultNotifications);
          setValue('transparency', 'transparent');
          logger.debug('🔄 [GoogleCalendar] Switched to all-day event - reset notifications to 30 minutes and transparency to free');
        } else if (currentAllDay === false) {
          setValue('notifications', defaultNotifications);
          setValue('transparency', 'opaque');
          logger.debug('🔄 [GoogleCalendar] Switched to timed event - reset notifications to 30 minutes and transparency to busy');
        }
      }
    }
  }, [values?.allDay, setValue]);

  useEffect(() => {
    if (values?.allDay) {
      hasCustomDurationRef.current = false;
      eventDurationRef.current = DEFAULT_EVENT_DURATION_MINUTES;
    }
  }, [values?.allDay]);

  useEffect(() => {
    if (values?.allDay) return;

    const startMinutes = timeStringToMinutes(values?.startTime);
    const endMinutes = timeStringToMinutes(values?.endTime);

    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return;
    }

    if (!initialDurationSyncedRef.current) {
      eventDurationRef.current = endMinutes - startMinutes;
      initialDurationSyncedRef.current = true;
      return;
    }

    if (autoUpdatingEndRef.current) {
      autoUpdatingEndRef.current = false;
      return;
    }

    eventDurationRef.current = endMinutes - startMinutes;
    hasCustomDurationRef.current = true;
  }, [values?.endTime, values?.startTime, values?.allDay]);

  useEffect(() => {
    if (values?.allDay) return;

    const startMinutes = timeStringToMinutes(values?.startTime);
    if (startMinutes === null) return;

    const endMinutes = timeStringToMinutes(values?.endTime);
    const hasValidEnd = endMinutes !== null && endMinutes > startMinutes;

    const storedDuration = hasCustomDurationRef.current ? eventDurationRef.current : null;
    const fallbackDuration = hasValidEnd
      ? (endMinutes as number) - startMinutes
      : eventDurationRef.current || DEFAULT_EVENT_DURATION_MINUTES;
    const duration = storedDuration ?? fallbackDuration ?? DEFAULT_EVENT_DURATION_MINUTES;

    const computedEnd = minutesToTimeString(normalizeMinutes(startMinutes + duration));

    if (hasValidEnd && values?.endTime === computedEnd) {
      return;
    }

    eventDurationRef.current = duration;
    autoUpdatingEndRef.current = true;
    setValue('endTime', computedEnd);
  }, [values?.startTime, values?.endTime, values?.allDay, setValue]);

  return <GenericConfiguration {...props} />;
}
