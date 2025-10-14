import { useCallback, useState } from 'react';

import { logger } from '@/lib/utils/logger'

interface BubbleSuggestion {
  value: any;
  label: string;
  fieldName?: string;
}

interface UseBubbleManagementProps {
  initialActiveBubbles?: Record<string, number | number[]>;
  initialFieldSuggestions?: Record<string, BubbleSuggestion[]>;
  initialOriginalBubbleValues?: Record<string, any>;
}

export function useBubbleManagement({
  initialActiveBubbles = {},
  initialFieldSuggestions = {},
  initialOriginalBubbleValues = {}
}: UseBubbleManagementProps = {}) {
  const [activeBubbles, setActiveBubbles] = useState<Record<string, number | number[]>>(initialActiveBubbles);
  const [fieldSuggestions, setFieldSuggestions] = useState<Record<string, BubbleSuggestion[]>>(initialFieldSuggestions);
  const [originalBubbleValues, setOriginalBubbleValues] = useState<Record<string, any>>(initialOriginalBubbleValues);

  /**
   * Check if a value already exists as a bubble
   */
  const bubbleExists = useCallback((fieldName: string, value: any): boolean => {
    const existingSuggestions = fieldSuggestions[fieldName] || [];
    return existingSuggestions.some((s: any) => s.value === value);
  }, [fieldSuggestions]);

  /**
   * Check if there's an active bubble for a field
   */
  const hasActiveBubble = useCallback((fieldName: string): boolean => {
    const activeBubbleIndices = activeBubbles[fieldName];
    return Array.isArray(activeBubbleIndices) 
      ? activeBubbleIndices.length > 0 
      : activeBubbleIndices !== undefined && activeBubbleIndices !== null;
  }, [activeBubbles]);

  /**
   * Add a new bubble for a field
   */
  const addBubble = useCallback((fieldName: string, value: any, label: string, isMultiValue: boolean = false) => {
    const newSuggestion: BubbleSuggestion = {
      value,
      label,
      fieldName
    };

    // Check if bubble already exists
    if (bubbleExists(fieldName, value)) {
      logger.debug(`Bubble already exists for value ${label} in field ${fieldName}`);
      return false;
    }

    if (!isMultiValue) {
      // Single-value field - replace existing bubble
      setFieldSuggestions(prev => ({
        ...prev,
        [fieldName]: [newSuggestion]
      }));
      
      // Automatically activate the bubble for single-value fields
      setActiveBubbles(prev => ({
        ...prev,
        [fieldName]: 0
      }));
      
      logger.debug(`Replaced bubble for single-value field ${fieldName}`);
    } else if (hasActiveBubble(fieldName)) {
      // Multi-value field with active bubble - replace the active bubble
      const activeBubbleIndices = activeBubbles[fieldName];
      
      setFieldSuggestions(prev => {
        const existing = [...(prev[fieldName] || [])];
        
        if (Array.isArray(activeBubbleIndices)) {
          // Multiple active bubbles - replace the first one
          const firstActiveIndex = activeBubbleIndices[0];
          if (firstActiveIndex !== undefined && existing[firstActiveIndex]) {
            existing[firstActiveIndex] = newSuggestion;
          }
        } else if (typeof activeBubbleIndices === 'number' && existing[activeBubbleIndices]) {
          // Single active bubble
          existing[activeBubbleIndices] = newSuggestion;
        }
        
        return {
          ...prev,
          [fieldName]: existing
        };
      });
      
      logger.debug(`Replaced active bubble with ${label}`);
    } else {
      // Multi-value field with no active bubble - add new bubble
      setFieldSuggestions(prev => ({
        ...prev,
        [fieldName]: [...(prev[fieldName] || []), newSuggestion]
      }));
      
      logger.debug(`Added new bubble for ${label}`);
    }

    return true;
  }, [activeBubbles, bubbleExists, hasActiveBubble]);

  /**
   * Remove a bubble at a specific index
   */
  const removeBubble = useCallback((fieldName: string, index: number) => {
    setFieldSuggestions(prev => {
      const existing = [...(prev[fieldName] || [])];
      existing.splice(index, 1);
      
      if (existing.length === 0) {
        const { [fieldName]: _, ...rest } = prev;
        return rest;
      }
      
      return {
        ...prev,
        [fieldName]: existing
      };
    });

    // Clear active bubble state if this was the active one
    setActiveBubbles(prev => {
      const activeBubbleIndices = prev[fieldName];
      
      if (Array.isArray(activeBubbleIndices)) {
        const newIndices = activeBubbleIndices.filter(i => i !== index);
        if (newIndices.length === 0) {
          const { [fieldName]: _, ...rest } = prev;
          return rest;
        }
        return {
          ...prev,
          [fieldName]: newIndices
        };
      } else if (activeBubbleIndices === index) {
        const { [fieldName]: _, ...rest } = prev;
        return rest;
      }
      
      return prev;
    });
  }, []);

  /**
   * Clear all bubbles for a field
   */
  const clearBubbles = useCallback((fieldName: string) => {
    setFieldSuggestions(prev => {
      const { [fieldName]: _, ...rest } = prev;
      return rest;
    });
    
    setActiveBubbles(prev => {
      const { [fieldName]: _, ...rest } = prev;
      return rest;
    });
    
    setOriginalBubbleValues(prev => {
      const { [fieldName]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  /**
   * Set a bubble as active
   */
  const setActiveBubble = useCallback((fieldName: string, index: number | number[] | null) => {
    if (index === null) {
      setActiveBubbles(prev => {
        const { [fieldName]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setActiveBubbles(prev => ({
        ...prev,
        [fieldName]: index
      }));
    }
  }, []);

  /**
   * Toggle a bubble's active state
   */
  const toggleBubbleActive = useCallback((fieldName: string, index: number, isMultiSelect: boolean = false) => {
    if (isMultiSelect) {
      setActiveBubbles(prev => {
        const current = prev[fieldName];
        const currentArray = Array.isArray(current) ? current : (current !== undefined ? [current] : []);
        
        if (currentArray.includes(index)) {
          // Remove from active
          const newArray = currentArray.filter(i => i !== index);
          if (newArray.length === 0) {
            const { [fieldName]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [fieldName]: newArray };
        } 
          // Add to active
          return { ...prev, [fieldName]: [...currentArray, index] };
        
      });
    } else {
      setActiveBubbles(prev => {
        if (prev[fieldName] === index) {
          // Deactivate if clicking the same bubble
          const { [fieldName]: _, ...rest } = prev;
          return rest;
        }
        // Activate this bubble
        return { ...prev, [fieldName]: index };
      });
    }
  }, []);

  /**
   * Get the combined value from all bubbles for a field
   */
  const getBubbleValues = useCallback((fieldName: string): any => {
    const suggestions = fieldSuggestions[fieldName] || [];
    if (suggestions.length === 0) return null;
    
    if (suggestions.length === 1) {
      return suggestions[0].value;
    }
    
    // For multiple bubbles, return an array of values
    return suggestions.map(s => s.value);
  }, [fieldSuggestions]);

  /**
   * Store original value when bubble is activated
   */
  const storeOriginalValue = useCallback((fieldName: string, value: any) => {
    setOriginalBubbleValues(prev => ({
      ...prev,
      [fieldName]: value
    }));
  }, []);

  return {
    activeBubbles,
    fieldSuggestions,
    originalBubbleValues,
    setActiveBubbles,
    setFieldSuggestions,
    setOriginalBubbleValues,
    bubbleExists,
    hasActiveBubble,
    addBubble,
    removeBubble,
    clearBubbles,
    setActiveBubble,
    toggleBubbleActive,
    getBubbleValues,
    storeOriginalValue
  };
}