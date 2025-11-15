/**
 * useFieldLabels Hook
 *
 * Manages field labels for instant display when reopening configuration modals.
 * Captures labels when user selects values and includes them in saved config.
 *
 * This enables the "Zapier experience" where all fields show their saved values
 * instantly when you reopen a node, without waiting for API calls.
 */

import { useCallback, useRef } from 'react'
import { getLabelKey } from '@/lib/workflows/configuration/label-persistence'
import { logger } from '@/lib/utils/logger'

interface UseFieldLabelsProps {
  setValue: (name: string, value: any) => void
}

interface UseFieldLabelsReturn {
  /**
   * Enhanced setValue that also saves the label
   */
  setValueWithLabel: (fieldName: string, value: any, label?: string | null) => void

  /**
   * Get saved labels to include in form submission
   */
  getSavedLabels: () => Record<string, string>

  /**
   * Record a label for a field (without setting the value)
   */
  recordLabel: (fieldName: string, label: string) => void
}

export function useFieldLabels({ setValue }: UseFieldLabelsProps): UseFieldLabelsReturn {
  // Store labels in a ref to avoid re-renders
  const labelsRef = useRef<Record<string, string>>({})

  /**
   * Set a field value and optionally save its label
   */
  const setValueWithLabel = useCallback((
    fieldName: string,
    value: any,
    label?: string | null
  ) => {
    // Set the actual field value
    setValue(fieldName, value)

    // Save the label if provided
    if (label) {
      labelsRef.current[fieldName] = label
      logger.debug('[useFieldLabels] Saved label:', { fieldName, value, label })
    }
  }, [setValue])

  /**
   * Record a label without setting a value
   * Useful when labels are discovered after value is already set
   */
  const recordLabel = useCallback((fieldName: string, label: string) => {
    labelsRef.current[fieldName] = label
    logger.debug('[useFieldLabels] Recorded label:', { fieldName, label })
  }, [])

  /**
   * Get all saved labels formatted with label keys
   * Returns: { _label_base: "CRM Database", _label_table: "Contacts", ... }
   */
  const getSavedLabels = useCallback((): Record<string, string> => {
    const labelData: Record<string, string> = {}

    for (const [fieldName, label] of Object.entries(labelsRef.current)) {
      const labelKey = getLabelKey(fieldName)
      labelData[labelKey] = label
    }

    return labelData
  }, [])

  return {
    setValueWithLabel,
    getSavedLabels,
    recordLabel
  }
}
