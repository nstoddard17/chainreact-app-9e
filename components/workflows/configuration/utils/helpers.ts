/**
 * General helper functions for the configuration form
 */

/**
 * Filters records by search query
 */
export function filterRecordsbySearch(records: any[], searchQuery: string): any[] {
  if (!searchQuery || !searchQuery.trim()) {
    return records;
  }
  
  const query = searchQuery.toLowerCase().trim();
  
  return records.filter(record => {
    // Search in ID
    if (record.id && record.id.toLowerCase().includes(query)) {
      return true;
    }
    
    // Search in fields
    if (record.fields) {
      const searchableFields = Object.entries(record.fields);
      
      return searchableFields.some(([fieldName, fieldValue]) => {
        let searchableValue = '';
        
        // Handle linked records specially
        if (fieldName === '_linkedRecordIds' && typeof fieldValue === 'object' && fieldValue !== null) {
          // This is the linked records mapping - search in the display names
          const linkedDisplay = (record.fields as any)._linkedRecordDisplay;
          if (linkedDisplay && typeof linkedDisplay === 'object') {
            // Search through all linked field display values
            Object.entries(linkedDisplay).forEach(([linkedFieldName, linkedValues]) => {
              if (Array.isArray(linkedValues)) {
                searchableValue += ` ${ linkedValues.join(' ')}`;
              }
            });
          }
        } else if (typeof fieldValue === 'string') {
          searchableValue = fieldValue.toLowerCase();
        } else if (typeof fieldValue === 'number' || typeof fieldValue === 'boolean') {
          searchableValue = String(fieldValue).toLowerCase();
        } else if (Array.isArray(fieldValue)) {
          // For non-linked arrays, search in the display values
          searchableValue = fieldValue.map(v => {
            if (typeof v === 'object' && v !== null) {
              // For attachments, search in filename
              if (v.filename) {
                return v.filename;
              }
              // For other objects, convert to string
              return JSON.stringify(v);
            }
            return String(v);
          }).join(' ').toLowerCase();
        } else if (typeof fieldValue === 'object' && fieldValue !== null) {
          // For objects, convert to readable string
          if (fieldValue.name) {
            searchableValue = fieldValue.name.toLowerCase();
          } else {
            searchableValue = JSON.stringify(fieldValue).toLowerCase();
          }
        }
        
        return searchableValue.includes(query);
      });
    }
    
    return false;
  });
}

/**
 * Infers field type from value and field name
 */
export function inferFieldType(value: any, fieldName?: string): string {
  // Check field name for hints
  if (fieldName) {
    const lowerFieldName = fieldName.toLowerCase();
    // Date-related field names
    if (lowerFieldName.includes('date') || 
        lowerFieldName.includes('time') || 
        lowerFieldName.includes('created') || 
        lowerFieldName.includes('modified') ||
        lowerFieldName.includes('updated')) {
      return 'date';
    }
    // Designer field - check if it's a collaborator field
    if (lowerFieldName.includes('designer') || 
        lowerFieldName.includes('assignee') || 
        lowerFieldName.includes('collaborator')) {
      // If it has array values, it's multiple collaborators
      if (Array.isArray(value)) {
        return 'multipleCollaborators';
      }
      return 'singleCollaborator';
    }
  }
  
  if (value === null || value === undefined) return 'singleLineText';
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0].url) {
      return 'multipleAttachments';
    }
    return 'multipleSelects';
  }
  if (typeof value === 'string') {
    // Check for common patterns
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    if (/^https?:\/\//.test(value)) return 'url';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
    if (value.includes('\n')) return 'multilineText';
    return 'singleLineText';
  }
  return 'singleLineText';
}

/**
 * Formats field value for display
 */
export function formatFieldValue(value: any, fieldType?: string): string {
  if (value === null || value === undefined) return '';
  
  if (Array.isArray(value)) {
    return value.map(v => {
      if (typeof v === 'object' && v !== null) {
        if (v.name) return v.name;
        if (v.filename) return v.filename;
        return JSON.stringify(v);
      }
      return String(v);
    }).join(', ');
  }
  
  if (typeof value === 'object' && value !== null) {
    if (value.name) return value.name;
    if (value.email) return value.email;
    return JSON.stringify(value);
  }
  
  if (typeof value === 'boolean') {
    return value ? '✓' : '';
  }
  
  return String(value);
}

/**
 * Gets Discord invite URL for bot
 */
export function getDiscordBotInviteUrl(clientId: string, guildId?: string): string {
  // Discord permissions integer from your selected checkboxes
  // This includes all the administrative and management permissions you selected
  const permissions = '4002221251362807';
  let inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;
  
  // If we have a specific guild ID, add it to the URL to pre-select the server
  if (guildId) {
    inviteUrl += `&guild_id=${guildId}`;
  }
  
  return inviteUrl;
}