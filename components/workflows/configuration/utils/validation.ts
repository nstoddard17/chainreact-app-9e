import { NodeComponent, NodeField, ConfigField } from "@/lib/workflows/nodes"

/**
 * Validates if a field is required and has a value
 * @param field The field configuration
 * @param value The current value of the field
 * @returns Error message if validation fails, or undefined if validation passes
 */
export const validateRequiredField = (
  field: NodeField | ConfigField,
  value: any
): string | undefined => {
  // Skip validation for hidden fields or non-required fields
  if (field.hidden || !field.required) {
    return undefined;
  }

  // Check if field has AI-generated value ({{AI_FIELD:fieldName}})
  const hasAIValue = typeof value === 'string' && /^\{\{AI_FIELD:.+\}\}$/.test(value);

  // Check if the field has a value (AI-generated values count as having a value)
  if (
    !hasAIValue && (
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    )
  ) {
    return `${field.label || field.name} is required`;
  }

  return undefined;
};

/**
 * Validates all required fields in a form
 * @param nodeInfo Node component information
 * @param config Current form configuration values
 * @returns Object with field errors
 */
export const validateAllRequiredFields = (
  nodeInfo: NodeComponent | null,
  config: Record<string, any>
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (!nodeInfo || !nodeInfo.configSchema) {
    return errors;
  }

  // Filter visible fields
  const visibleFields = nodeInfo.configSchema.filter(
    (field) => !shouldHideField(field, config)
  );

  // Validate each visible required field
  visibleFields.forEach((field) => {
    const value = config[field.name];
    const error = validateRequiredField(field, value);
    
    if (error) {
      errors[field.name] = error;
    }
  });

  return errors;
};

/**
 * Determines if a field should be hidden based on dependencies
 * @param field The field configuration
 * @param config Current form values
 * @returns Boolean indicating if the field should be hidden
 */
export const shouldHideField = (
  field: NodeField | ConfigField,
  config: Record<string, any>
): boolean => {
  // Check if the field has explicit hidden property and showIf function
  if (field.hidden && (field as any).showIf) {
    // If there's a showIf function, evaluate it
    if (typeof (field as any).showIf === 'function') {
      const shouldShow = (field as any).showIf(config);
      return !shouldShow; // Hide if showIf returns false
    }
  }
  
  // Check if the field has explicit hidden property without showIf
  if (field.hidden && !(field as any).showIf) {
    return true;
  }

  // Check if there's just a showIf function without hidden property
  if ((field as any).showIf && typeof (field as any).showIf === 'function') {
    const shouldShow = (field as any).showIf(config);
    return !shouldShow; // Hide if showIf returns false
  }

  // Check conditional property (used in Google Drive and other nodes)
  if ((field as any).conditional) {
    const conditional = (field as any).conditional;
    const conditionFieldValue = config[conditional.field];
    
    // Hide if the condition doesn't match
    if (conditional.value !== undefined) {
      return conditionFieldValue !== conditional.value;
    }
  }

  // Check dependency conditions (legacy showIf with dependsOn)
  if (field.dependsOn && field.showIf) {
    const dependentValue = config[field.dependsOn];
    
    // If the dependent field doesn't have a value, hide this field
    if (dependentValue === undefined || dependentValue === null || dependentValue === "") {
      return true;
    }

    // Check if current value matches any of the allowed values
    if (Array.isArray(field.showIf)) {
      return !field.showIf.includes(dependentValue);
    } else {
      return dependentValue !== field.showIf;
    }
  }

  // Check showWhen property (another variation used in some nodes)
  if ((field as any).showWhen) {
    const showWhen = (field as any).showWhen;
    for (const [conditionField, conditionValues] of Object.entries(showWhen)) {
      const currentValue = config[conditionField];
      
      // Handle special cases
      if (conditionValues === "!empty") {
        // Field should show only when the condition field has a non-empty value
        if (!currentValue || currentValue === '') {
          return true; // Hide if empty
        }
      } else if (Array.isArray(conditionValues)) {
        // Field should show only when the condition field matches one of the values
        if (!conditionValues.includes(currentValue)) {
          return true; // Hide if not matching
        }
      } else {
        // Single value comparison
        if (currentValue !== conditionValues) {
          return true; // Hide if not matching
        }
      }
    }
  }

  // By default, show the field if not explicitly hidden
  return false;
};

/**
 * Gets all visible fields for a node
 * @param nodeInfo Node component information
 * @param config Current form values
 * @returns Array of visible fields
 */
export const getVisibleFields = (
  nodeInfo: NodeComponent | null,
  config: Record<string, any>
): (NodeField | ConfigField)[] => {
  if (!nodeInfo || !nodeInfo.configSchema) {
    return [];
  }

  return nodeInfo.configSchema.filter(
    (field) => !shouldHideField(field, config)
  );
};