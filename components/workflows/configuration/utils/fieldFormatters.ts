/**
 * Field Formatters
 * Functions to format API responses into option data for different field types
 */

export interface FormattedOption {
  value: string;
  label: string;
  [key: string]: any; // Additional properties specific to field type
}

/**
 * Truncate long messages for display
 */
function truncateMessage(message: string, maxLength = 30): string {
  if (!message) return "";
  return message.length > maxLength
    ? `${message.substring(0, maxLength)}...`
    : message;
}

/**
 * Format email/recipient fields
 */
function formatEmailField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.email || item.value || item.id || item,
    label: item.label || (item.name ? `${item.name} <${item.email || item.value}>` : item.email || item.value || item.id || item),
    email: item.email || item.value,
    name: item.name,
    type: item.type,
    isGroup: item.isGroup,
    groupId: item.groupId,
    members: item.members
  }));
}

/**
 * Format label fields
 */
function formatLabelField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.id || item,
    label: item.name || item.id || item,
  }));
}

/**
 * Format channel fields
 */
function formatChannelField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.id || item.value,
    label: item.name || item.label || item.id,
  }));
}

/**
 * Format author/user fields
 */
function formatAuthorField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.id || item.value,
    label: item.username || item.name || item.label || item.id,
  }));
}

/**
 * Format message fields
 */
function formatMessageField(data: any[]): FormattedOption[] {
  return data.map((item: any) => {
    // Use the formatted name from backend if available (includes author, date, and preview)
    let baseLabel = item.name || item.label;
    
    // Fall back to creating our own format if backend doesn't provide one
    if (!baseLabel) {
      baseLabel = item.content || `Message by ${item.author?.username || 'Unknown'} (${item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown time'})`;
    }
    
    // Add reaction count if there are reactions
    const reactions = item.reactions || [];
    const hasReactions = reactions.length > 0;
    const reactionCount = hasReactions ? reactions.reduce((total: number, reaction: any) => total + reaction.count, 0) : 0;
    const label = hasReactions ? `${baseLabel} [${reactionCount} reactions]` : baseLabel;
    
    return {
      id: item.id,
      value: item.id,
      label,
      content: item.content,
      author: item.author,
      timestamp: item.timestamp,
      type: item.type,
      reactions: reactions
    };
  });
}

/**
 * Format board fields
 */
function formatBoardField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.id,
    label: item.name || item.id,
  }));
}

/**
 * Format list fields
 */
function formatListField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.id,
    label: item.name || item.id,
  }));
}

/**
 * Format database fields
 */
function formatDatabaseField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.id,
    label: item.title || item.name || item.id,
    fields: item.fields || item.properties,
    isExisting: true,
  }));
}

/**
 * Format base fields (Airtable)
 */
function formatBaseField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.id || item.value,
    label: item.name || item.label || item.id,
  }));
}

/**
 * Format table fields (Airtable)
 */
function formatTableField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.name || item.id || item.value,
    label: item.name || item.label || item.id,
    fields: item.fields,
    description: item.description
  }));
}

/**
 * Format sheet fields (Google Sheets)
 */
function formatSheetField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.value || item.name || item.id,
    label: item.name || item.label || item.value || item.id,
  }));
}

/**
 * Format filter field options (Airtable)
 */
function formatFilterField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.value || item.name,
    label: item.label || item.name,
    type: item.type,
    id: item.id
  }));
}

/**
 * Format filter value options (Airtable)
 */
function formatFilterValue(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.value,
    label: item.label + (item.count ? ` (${item.count})` : ''),
    count: item.count
  }));
}

/**
 * Default formatter for unspecified field types
 */
function formatDefaultField(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.id,
    label: item.name || item.title || item.id,
  }));
}

/**
 * Field formatter mapping
 */
const fieldFormatters: Record<string, (data: any[]) => FormattedOption[]> = {
  // Email/recipient fields
  from: formatEmailField,
  to: formatEmailField,
  cc: formatEmailField,
  bcc: formatEmailField,
  email: formatEmailField,
  attendees: formatEmailField,
  
  // Label fields
  labelIds: formatLabelField,
  
  // Discord fields
  channelId: formatChannelField,
  filterAuthor: formatAuthorField,
  messageId: formatMessageField,
  
  // Board management fields
  boardId: formatBoardField,
  listId: formatListField,
  
  // Database fields
  databaseId: formatDatabaseField,
  
  // Airtable fields
  baseId: formatBaseField,
  tableName: formatTableField,
  filterField: formatFilterField,
  filterValue: formatFilterValue,
  
  // Google Sheets fields
  sheetName: formatSheetField,
};

/**
 * Main function to format options for a field
 */
export function formatOptionsForField(fieldName: string, data: any): FormattedOption[] {
  if (!data || !Array.isArray(data)) {
    return [];
  }
  
  const formatter = fieldFormatters[fieldName] || formatDefaultField;
  return formatter(data);
}