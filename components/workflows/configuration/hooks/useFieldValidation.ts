import { useMemo } from 'react';
import { FieldVisibilityEngine, Field } from '@/lib/workflows/fields/visibility';

interface UseFieldValidationProps {
  nodeInfo: any;
  values: Record<string, any>;
}

/**
 * Hook for handling field validation with support for conditional required fields
 *
 * This hook now delegates to the centralized FieldVisibilityEngine for consistent
 * visibility evaluation across the application.
 *
 * @see /lib/workflows/fields/visibility.ts for the visibility evaluation engine
 */
export function useFieldValidation({ nodeInfo, values }: UseFieldValidationProps) {

  /**
   * Determines if a field is currently visible based on its conditions
   * Delegates to FieldVisibilityEngine for centralized evaluation
   */
  const isFieldVisible = (field: Field): boolean => {
    return FieldVisibilityEngine.isFieldVisible(field, values, nodeInfo);
  };

  /**
   * Gets all fields that are currently visible
   */
  const getVisibleFields = useMemo(() => {
    if (!nodeInfo?.configSchema) return [];

    return FieldVisibilityEngine.getVisibleFields(
      nodeInfo.configSchema,
      values,
      nodeInfo
    );
  }, [nodeInfo, values]);

  /**
   * Validates only the visible required fields
   */
  const validateRequiredFields = (): { isValid: boolean; errors: Record<string, string> } => {
    if (!nodeInfo?.configSchema) {
      return { isValid: true, errors: {} };
    }

    return FieldVisibilityEngine.validate(
      nodeInfo.configSchema,
      values,
      nodeInfo
    );
  };

  /**
   * Checks if a specific field should be validated
   */
  const shouldValidateField = (fieldName: string): boolean => {
    const field = nodeInfo?.configSchema?.find((f: Field) => f.name === fieldName);
    if (!field) return false;

    // Only validate if field is visible and required
    return isFieldVisible(field) && (field.required || field.validation?.required);
  };

  /**
   * Gets required fields that are currently missing values
   * Only includes visible fields
   */
  const getMissingRequiredFields = (): string[] => {
    if (!nodeInfo?.configSchema) return [];

    return FieldVisibilityEngine.getMissingRequiredFields(
      nodeInfo.configSchema,
      values,
      nodeInfo
    );
  };

  /**
   * Gets ALL visible required fields from the schema
   * Used for displaying complete required fields list
   *
   * NOTE: This now only returns VISIBLE required fields, not all required fields.
   * This prevents hidden conditional fields from showing in INCOMPLETE validation messages.
   */
  const getAllRequiredFields = (): string[] => {
    if (!nodeInfo?.configSchema) return [];

    return FieldVisibilityEngine.getVisibleRequiredFields(
      nodeInfo.configSchema,
      values,
      nodeInfo
    );
  };

  /**
   * Checks if form can be submitted (all visible required fields have values)
   */
  const canSubmit = (): boolean => {
    const { isValid } = validateRequiredFields();
    return isValid;
  };

  return {
    isFieldVisible,
    getVisibleFields,
    validateRequiredFields,
    shouldValidateField,
    getMissingRequiredFields,
    getAllRequiredFields,
    canSubmit
  };
}
