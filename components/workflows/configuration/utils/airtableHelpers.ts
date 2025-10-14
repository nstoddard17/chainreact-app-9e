/**
 * Helper functions for Airtable field type mappings and schema utilities
 */

/**
 * Maps Airtable field types to form field types
 */
export function getAirtableFieldType(airtableType: string): string {
  switch (airtableType) {
    case 'singleLineText':
    case 'multilineText':
    case 'richText':
    case 'email':
    case 'phoneNumber':
    case 'url':
      return 'text';
    case 'number':
    case 'rating':
    case 'percent':
    case 'currency':
    case 'duration':
      return 'number';
    case 'checkbox':
      return 'boolean';
    case 'singleSelect':
    case 'multipleSelects':
    case 'singleCollaborator':
    case 'multipleCollaborators':
      return 'select';
    case 'date':
    case 'dateTime':
      return 'date';
    case 'attachment':
    case 'multipleAttachments':
      return 'file';
    default:
      return 'text';
  }
}

/**
 * Maps Airtable field types from schema to form field types
 */
export function getAirtableFieldTypeFromSchema(field: any): string {
  const { type, name } = field;
  
  // Check field name for type hints (same logic as inferFieldType)
  if (name) {
    const lowerFieldName = name.toLowerCase();
    // Date-related field names should always be date pickers
    // Use word boundaries to avoid false matches (e.g., "Sentiment" contains "time")
    const dateKeywords = ['date', 'time', 'created', 'modified', 'updated'];
    const hasDateKeyword = dateKeywords.some(keyword => {
      // Check if the keyword appears as a separate word (surrounded by non-letter characters or at start/end)
      const regex = new RegExp(`(^|[^a-z])${keyword}([^a-z]|$)`, 'i');
      return regex.test(lowerFieldName);
    });

    if (hasDateKeyword) {
      return 'date';
    }
  }
  
  // If field has predefined choices, it's a select
  if (field.choices && field.choices.length > 0) {
    return 'select';
  }
  
  switch (type) {
    case 'singleLineText':
      // Check if it should be a date based on field name (with word boundaries)
      if (name) {
        const regex = new RegExp(`(^|[^a-z])date([^a-z]|$)`, 'i');
        if (regex.test(name.toLowerCase())) {
          return 'date';
        }
      }
      return 'text';
    case 'multilineText':
    case 'richText':
      return 'textarea';
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'phoneNumber':
      return 'tel';
    case 'number':
    case 'rating':
    case 'percent':
    case 'currency':
    case 'duration':
    case 'count':
    case 'autoNumber':
      return 'number';
    case 'checkbox':
      return 'boolean';
    case 'singleSelect':
      return 'select';
    case 'multipleSelects':
    case 'multipleCollaborators':
    case 'multipleRecordLinks':
    case 'multipleLookupValues':
      return 'multi_select';
    case 'date':
    case 'dateTime':
    case 'createdTime':
    case 'lastModifiedTime':
      return 'date';
    case 'attachment':
    case 'multipleAttachments':
      return 'file';
    case 'singleCollaborator':
    case 'createdBy':
    case 'lastModifiedBy':
      return 'select';
    case 'singleRecordLink':
    case 'rollup':
    case 'formula':
    case 'lookup':
      return 'text';
    case 'barcode':
      return 'text';
    case 'button':
      return 'button';
    default:
      return 'text';
  }
}

/**
 * Checks if a field is AI-enabled based on its value
 */
export function isAIField(value: any): boolean {
  return typeof value === 'string' && value.startsWith('{{AI_FIELD:') && value.endsWith('}}');
}

/**
 * Gets the field name from an AI field placeholder
 */
export function getAIFieldName(value: string): string | null {
  const match = value.match(/^\{\{AI_FIELD:(.+)\}\}$/);
  return match ? match[1] : null;
}

/**
 * Creates an AI field placeholder
 */
export function createAIFieldPlaceholder(fieldName: string): string {
  return `{{AI_FIELD:${fieldName}}}`;
}

/**
 * Checks if a field type is editable (not computed/auto)
 */
export function isEditableFieldType(type: string): boolean {
  const nonEditableTypes = [
    'formula',
    'rollup',
    'count',
    'lookup',
    'autoNumber',
    'createdTime',
    'lastModifiedTime',
    'createdBy',
    'lastModifiedBy',
    'button'
  ];
  return !nonEditableTypes.includes(type);
}