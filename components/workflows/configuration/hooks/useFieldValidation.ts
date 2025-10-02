import { useMemo } from 'react';

interface Field {
  name: string;
  label?: string;
  required?: boolean;
  validation?: {
    required?: boolean;
  };
  dependsOn?: string;
  hidden?: boolean;
  showWhen?: {
    field: string;
    value: any;
  };
}

interface UseFieldValidationProps {
  nodeInfo: any;
  values: Record<string, any>;
}

/**
 * Hook for handling field validation with support for conditional required fields
 * 
 * This hook solves the problem where fields are marked as required in the schema
 * but may not actually be required because they're part of a different user flow
 * or are conditionally hidden based on other field values.
 */
export function useFieldValidation({ nodeInfo, values }: UseFieldValidationProps) {
  
  /**
   * Determines if a field is currently visible based on its conditions
   */
  const isFieldVisible = (field: Field): boolean => {
    // Check if field has a dependsOn condition
    if (field.dependsOn) {
      const parentValue = values[field.dependsOn];
      // Field is only visible if parent has a value
      if (!parentValue || parentValue === '') {
        return false;
      }
    }

    // Check if field has a showWhen condition
    if (field.showWhen) {
      const conditionValue = values[field.showWhen.field];
      // Field is only visible if condition is met
      if (conditionValue !== field.showWhen.value) {
        return false;
      }
    }

    // Check if field is explicitly hidden
    if (field.hidden) {
      return false;
    }

    // Special cases for provider-specific visibility rules
    if (nodeInfo?.providerId === 'airtable') {
      // For Airtable create/update actions, dynamic fields are only shown
      // when tableName is selected and schema is loaded
      if (field.name.startsWith('airtable_field_')) {
        if (!values.tableName) return false;
      }

      // recordId field is only needed for update action
      if (field.name === 'recordId' && nodeInfo.type === 'airtable_action_create_record') {
        return false; // Hide recordId for create action
      }

      // Filter fields only for list records action
      if ((field.name === 'filterField' || field.name === 'filterValue') && 
          nodeInfo.type !== 'airtable_action_list_records') {
        return false;
      }
    }

    if (nodeInfo?.providerId === 'google-sheets') {
      // Update-specific fields only visible when action is 'update'
      if (field.name.startsWith('updateMapping.') && values.action !== 'update') {
        return false;
      }
      
      // Range field only for read action
      if (field.name === 'range' && values.action !== 'read') {
        return false;
      }
    }

    if (nodeInfo?.providerId === 'discord') {
      // Message ID only needed for certain actions
      if (field.name === 'messageId') {
        const needsMessage = [
          'discord_action_edit_message',
          'discord_action_delete_message',
          'discord_action_add_reaction',
          'discord_action_remove_reaction'
        ].includes(nodeInfo.type);
        
        if (!needsMessage) return false;
      }

      // Emoji field only for reaction actions
      if (field.name === 'emoji') {
        const needsEmoji = [
          'discord_action_add_reaction',
          'discord_action_remove_reaction'
        ].includes(nodeInfo.type);
        
        if (!needsEmoji) return false;
      }
    }

    return true;
  };

  /**
   * Gets all fields that are currently visible
   */
  const getVisibleFields = useMemo(() => {
    if (!nodeInfo?.configSchema) return [];
    
    return nodeInfo.configSchema.filter((field: Field) => isFieldVisible(field));
  }, [nodeInfo, values]);

  /**
   * Validates only the visible required fields
   */
  const validateRequiredFields = (): { isValid: boolean; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};
    let isValid = true;

    // Only validate visible fields
    const visibleFields = getVisibleFields;

    visibleFields.forEach((field: Field) => {
      // Check if field is required
      const isRequired = field.required || field.validation?.required;
      
      if (isRequired) {
        const fieldValue = values[field.name];

        // Check if field has AI-generated value ({{AI_FIELD:fieldName}})
        const hasAIValue = typeof fieldValue === 'string' && /^\{\{AI_FIELD:.+\}\}$/.test(fieldValue);

        // Check if field is empty
        const isEmpty =
          !hasAIValue && (
            fieldValue === undefined ||
            fieldValue === null ||
            fieldValue === '' ||
            (Array.isArray(fieldValue) && fieldValue.length === 0) ||
            (typeof fieldValue === 'object' &&
             !Array.isArray(fieldValue) &&
             Object.keys(fieldValue).length === 0)
          );

        if (isEmpty) {
          errors[field.name] = `${field.label || field.name} is required`;
          isValid = false;
        }
      }
    });

    return { isValid, errors };
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
   */
  const getMissingRequiredFields = (): string[] => {
    const { errors } = validateRequiredFields();
    return Object.keys(errors);
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
    canSubmit
  };
}