"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useIntegrationStore } from "@/stores/integrationStore";
import { DynamicOptionsState } from '../utils/types';
import { getResourceTypeForField } from '../config/fieldMappings';
import { formatOptionsForField } from '../utils/fieldFormatters';
import { RequestManager } from '../utils/requestManager';
import { CacheManager } from '../utils/cacheManager';
import { providerRegistry } from '../providers/registry';
import { LoadOptionsParams } from '../providers/types';

interface UseDynamicOptionsProps {
  nodeType?: string;
  providerId?: string;
  onLoadingChange?: (fieldName: string, isLoading: boolean) => void;
  getFormValues?: () => Record<string, any>;
}

interface DynamicOption {
  value: string;
  label: string;
  fields?: any[];
  isExisting?: boolean;
}

/**
 * Custom hook for managing dynamic field options
 * Refactored version with modular architecture
 */
export const useDynamicOptions = ({ 
  nodeType, 
  providerId, 
  onLoadingChange, 
  getFormValues 
}: UseDynamicOptionsProps) => {
  // Store callback in ref to avoid dependency issues
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;

  // State
  const [dynamicOptions, setDynamicOptions] = useState<DynamicOptionsState>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(false);
  
  // Integration store methods
  const { getIntegrationByProvider, loadIntegrationData } = useIntegrationStore();
  
  // Create managers using useMemo to maintain instances across renders
  const requestManager = useMemo(() => new RequestManager(), []);
  const cacheManager = useMemo(() => new CacheManager(), []);
  
  // Track loading fields
  const loadingFields = useRef<Set<string>>(new Set());

  /**
   * Reset options for a field
   */
  const resetOptions = useCallback((fieldName: string) => {
    setDynamicOptions(prev => ({
      ...prev,
      [fieldName]: []
    }));
    
    // Invalidate cache for this field
    const cacheKey = cacheManager.generateCacheKey(fieldName, nodeType);
    cacheManager.invalidate(cacheKey);
  }, [nodeType, cacheManager]);

  /**
   * Load options for a dynamic field
   */
  const loadOptions = useCallback(async (
    fieldName: string, 
    dependsOn?: string, 
    dependsOnValue?: any, 
    forceRefresh?: boolean, 
    silent?: boolean, 
    extraOptions?: Record<string, any>
  ) => {
    console.log(`📍 [loadOptions] Called for field:`, { 
      fieldName, 
      nodeType, 
      providerId, 
      dependsOn, 
      dependsOnValue, 
      forceRefresh, 
      silent
    });
    
    if (!nodeType || !providerId) {
      console.warn('⚠️ [loadOptions] Missing nodeType or providerId');
      return;
    }

    // Auto-detect dependencies for certain fields
    if (fieldName === 'messageId' && !dependsOn) {
      dependsOn = 'channelId';
    }

    // Generate cache key
    const dependentValues = dependsOn && dependsOnValue 
      ? { [dependsOn]: dependsOnValue }
      : undefined;
    const cacheKey = cacheManager.generateCacheKey(fieldName, nodeType, dependentValues);
    
    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        console.log('✅ [loadOptions] Using cached data for:', fieldName);
        setDynamicOptions(prev => ({
          ...prev,
          [fieldName]: cached
        }));
        return;
      }
    }

    // Generate request ID for tracking
    const requestId = requestManager.generateRequestId();
    
    // Create abort controller
    const abortController = requestManager.createAbortController(cacheKey, requestId);
    
    // Prevent duplicate requests
    if (!forceRefresh && requestManager.hasActiveRequest(cacheKey)) {
      console.log('🔄 [loadOptions] Waiting for existing request:', fieldName);
      try {
        await requestManager.getActiveRequest(cacheKey);
        // Check cache again after request completes
        const cached = cacheManager.get(cacheKey);
        if (cached) {
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: cached
          }));
        }
        return;
      } catch (error) {
        console.error('❌ [loadOptions] Existing request failed:', error);
      }
    }

    // Create loading promise
    const loadingPromise = (async () => {
      // Set loading states if not silent
      if (!silent) {
        loadingFields.current.add(cacheKey);
        setLoading(true);
        onLoadingChangeRef.current?.(fieldName, true);
      }

      try {
        let options: DynamicOption[] = [];

        // Check if we have a provider-specific loader
        const providerLoader = providerRegistry.getLoader(providerId, fieldName);
        
        if (providerLoader) {
          console.log('🔌 [loadOptions] Using provider loader for:', fieldName);
          
          const integration = getIntegrationByProvider(providerId);
          const params: LoadOptionsParams = {
            fieldName,
            nodeType,
            providerId,
            integrationId: integration?.id,
            dependsOn,
            dependsOnValue,
            forceRefresh,
            extraOptions: extraOptions || getFormValues?.(),
            signal: abortController.signal
          };
          
          options = await providerLoader.loadOptions(params);
        } else {
          // Fallback to generic loading
          const resourceType = getResourceTypeForField(fieldName, nodeType);
          
          if (!resourceType) {
            console.log('🔍 [loadOptions] No resource type for field:', fieldName);
            return;
          }

          const integration = getIntegrationByProvider(providerId);
          if (!integration) {
            console.warn('❌ [loadOptions] No integration found for provider:', providerId);
            return;
          }

          const apiOptions = dependsOn && dependsOnValue 
            ? { [dependsOn]: dependsOnValue }
            : {};

          console.log('🚀 [loadOptions] Calling loadIntegrationData...');
          const result = await loadIntegrationData(
            resourceType, 
            integration.id, 
            apiOptions, 
            forceRefresh
          );
          
          const dataArray = result.data || result;
          options = formatOptionsForField(fieldName, dataArray);
        }

        // Check if request is still current
        if (!requestManager.isCurrentRequest(cacheKey, requestId)) {
          console.log('🚫 [loadOptions] Request superseded, not updating state');
          return;
        }

        // Cache the results
        cacheManager.set(cacheKey, options, undefined, dependsOn ? [dependsOn] : undefined);

        // Update state
        const updateObject: any = { [fieldName]: options };
        
        // For dependent fields, also store with dependency-specific key
        if (dependsOn && dependsOnValue) {
          updateObject[`${fieldName}_${dependsOnValue}`] = options;
        }
        
        setDynamicOptions(prev => ({
          ...prev,
          ...updateObject
        }));

      } catch (error: any) {
        // Check if aborted
        if (requestManager.isAbortError(error)) {
          console.log('🚫 [loadOptions] Request aborted for:', fieldName);
          return;
        }

        console.error(`❌ [loadOptions] Failed to load options for ${fieldName}:`, error);
        setDynamicOptions(prev => ({
          ...prev,
          [fieldName]: []
        }));
      } finally {
        // Clean up if still current request
        if (requestManager.isCurrentRequest(cacheKey, requestId)) {
          loadingFields.current.delete(cacheKey);
          setLoading(false);
          requestManager.cleanupRequest(cacheKey, requestId);
          
          if (!silent) {
            onLoadingChangeRef.current?.(fieldName, false);
          }
        }
      }
    })();

    // Store the promise for deduplication
    requestManager.setActiveRequest(cacheKey, loadingPromise);
    
    try {
      await loadingPromise;
    } finally {
      requestManager.cleanupRequest(cacheKey);
    }
  }, [
    nodeType, 
    providerId, 
    getIntegrationByProvider, 
    loadIntegrationData,
    requestManager,
    cacheManager,
    getFormValues
  ]);

  /**
   * Clear all state when node type or provider changes
   */
  useEffect(() => {
    console.log('🔄 [useDynamicOptions] Node type or provider changed, clearing state');
    
    // Cancel all active requests
    requestManager.cancelAllRequests();
    
    // Clear cache
    cacheManager.clear();
    
    // Reset state
    setDynamicOptions({});
    loadingFields.current.clear();
    setLoading(false);
    setIsInitialLoading(false);
  }, [nodeType, providerId, requestManager, cacheManager]);

  /**
   * Preload independent fields when modal opens
   */
  useEffect(() => {
    if (!nodeType || !providerId) return;

    // Preload fields that don't depend on other fields
    const independentFields = ['baseId', 'guildId', 'workspaceId', 'boardId'];
    
    independentFields.forEach(fieldName => {
      const resourceType = getResourceTypeForField(fieldName, nodeType);
      if (resourceType) {
        loadOptions(fieldName);
      }
    });
    
    // Cleanup on unmount
    return () => {
      console.log('🧹 [useDynamicOptions] Unmounting, cleaning up...');
      requestManager.cancelAllRequests();
      loadingFields.current.clear();
      setLoading(false);
      setIsInitialLoading(false);
    };
  }, [nodeType, providerId]); // loadOptions removed to prevent loops

  /**
   * Periodic cache cleanup
   */
  useEffect(() => {
    const interval = setInterval(() => {
      cacheManager.clearExpired();
    }, 60000); // Clean expired cache entries every minute

    return () => clearInterval(interval);
  }, [cacheManager]);

  return {
    dynamicOptions,
    loading,
    isInitialLoading,
    loadOptions,
    resetOptions,
    setDynamicOptions,
    // Expose managers for debugging if needed
    _debug: {
      requestStats: () => requestManager.getStats(),
      cacheStats: () => cacheManager.getStats()
    }
  };
};