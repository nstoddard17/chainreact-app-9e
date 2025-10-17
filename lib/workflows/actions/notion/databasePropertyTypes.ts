/**
 * Notion Database Property Types and Configuration
 *
 * Defines all supported Notion property types and their configuration options
 */

export type NotionPropertyType =
  | 'title'
  | 'rich_text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'people'
  | 'files'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone_number'
  | 'formula'
  | 'relation'
  | 'rollup'
  | 'created_time'
  | 'created_by'
  | 'last_edited_time'
  | 'last_edited_by'
  | 'status'

export interface SelectOption {
  name: string
  color?: string
}

export interface DatabaseProperty {
  name: string
  type: NotionPropertyType
  options?: SelectOption[] // For select/multi_select
  format?: string // For number (number, number_with_commas, percent, etc.)
  formula?: string // For formula type
  relationDatabase?: string // For relation type
}

export interface DatabasePropertyConfig {
  properties: DatabaseProperty[]
}

/**
 * Property type metadata for UI display
 */
export const PROPERTY_TYPE_METADATA: Record<NotionPropertyType, {
  label: string
  description: string
  icon: string
  supportsOptions: boolean
  supportsFormat: boolean
  category: 'basic' | 'advanced' | 'system'
}> = {
  title: {
    label: 'Title',
    description: 'Main title field (required, only one per database)',
    icon: '📝',
    supportsOptions: false,
    supportsFormat: false,
    category: 'basic'
  },
  rich_text: {
    label: 'Text',
    description: 'Multi-line text with formatting',
    icon: '📄',
    supportsOptions: false,
    supportsFormat: false,
    category: 'basic'
  },
  number: {
    label: 'Number',
    description: 'Numeric value with optional formatting',
    icon: '#️⃣',
    supportsOptions: false,
    supportsFormat: true,
    category: 'basic'
  },
  select: {
    label: 'Select',
    description: 'Single choice from predefined options',
    icon: '🏷️',
    supportsOptions: true,
    supportsFormat: false,
    category: 'basic'
  },
  multi_select: {
    label: 'Multi-select',
    description: 'Multiple choices from predefined options',
    icon: '🏷️',
    supportsOptions: true,
    supportsFormat: false,
    category: 'basic'
  },
  date: {
    label: 'Date',
    description: 'Date or date range',
    icon: '📅',
    supportsOptions: false,
    supportsFormat: false,
    category: 'basic'
  },
  people: {
    label: 'Person',
    description: 'Workspace member(s)',
    icon: '👤',
    supportsOptions: false,
    supportsFormat: false,
    category: 'basic'
  },
  files: {
    label: 'Files & Media',
    description: 'File attachments',
    icon: '📎',
    supportsOptions: false,
    supportsFormat: false,
    category: 'basic'
  },
  checkbox: {
    label: 'Checkbox',
    description: 'True/false toggle',
    icon: '☑️',
    supportsOptions: false,
    supportsFormat: false,
    category: 'basic'
  },
  url: {
    label: 'URL',
    description: 'Web address',
    icon: '🔗',
    supportsOptions: false,
    supportsFormat: false,
    category: 'basic'
  },
  email: {
    label: 'Email',
    description: 'Email address',
    icon: '📧',
    supportsOptions: false,
    supportsFormat: false,
    category: 'basic'
  },
  phone_number: {
    label: 'Phone',
    description: 'Phone number',
    icon: '📞',
    supportsOptions: false,
    supportsFormat: false,
    category: 'basic'
  },
  status: {
    label: 'Status',
    description: 'Status with groups and options',
    icon: '🚦',
    supportsOptions: true,
    supportsFormat: false,
    category: 'basic'
  },
  formula: {
    label: 'Formula',
    description: 'Computed value based on other properties',
    icon: 'ƒ',
    supportsOptions: false,
    supportsFormat: false,
    category: 'advanced'
  },
  relation: {
    label: 'Relation',
    description: 'Link to another database',
    icon: '🔗',
    supportsOptions: false,
    supportsFormat: false,
    category: 'advanced'
  },
  rollup: {
    label: 'Rollup',
    description: 'Aggregate data from related database',
    icon: '📊',
    supportsOptions: false,
    supportsFormat: false,
    category: 'advanced'
  },
  created_time: {
    label: 'Created Time',
    description: 'When the item was created (auto)',
    icon: '🕐',
    supportsOptions: false,
    supportsFormat: false,
    category: 'system'
  },
  created_by: {
    label: 'Created By',
    description: 'Who created the item (auto)',
    icon: '👤',
    supportsOptions: false,
    supportsFormat: false,
    category: 'system'
  },
  last_edited_time: {
    label: 'Last Edited Time',
    description: 'When the item was last edited (auto)',
    icon: '🕐',
    supportsOptions: false,
    supportsFormat: false,
    category: 'system'
  },
  last_edited_by: {
    label: 'Last Edited By',
    description: 'Who last edited the item (auto)',
    icon: '👤',
    supportsOptions: false,
    supportsFormat: false,
    category: 'system'
  }
}

/**
 * Number format options
 */
export const NUMBER_FORMATS = [
  { value: 'number', label: 'Number' },
  { value: 'number_with_commas', label: 'Number with commas' },
  { value: 'percent', label: 'Percent' },
  { value: 'dollar', label: 'Dollar' },
  { value: 'canadian_dollar', label: 'Canadian Dollar' },
  { value: 'euro', label: 'Euro' },
  { value: 'pound', label: 'Pound' },
  { value: 'yen', label: 'Yen' },
  { value: 'ruble', label: 'Ruble' },
  { value: 'rupee', label: 'Rupee' },
  { value: 'won', label: 'Won' },
  { value: 'yuan', label: 'Yuan' }
]

/**
 * Select option colors
 */
export const SELECT_COLORS = [
  'default', 'gray', 'brown', 'orange', 'yellow',
  'green', 'blue', 'purple', 'pink', 'red'
]

/**
 * Convert our property configuration to Notion API format
 */
export function convertToNotionProperties(properties: DatabaseProperty[]): Record<string, any> {
  const notionProperties: Record<string, any> = {}

  for (const prop of properties) {
    const propertyConfig: any = {}

    switch (prop.type) {
      case 'title':
        propertyConfig.title = {}
        break

      case 'rich_text':
        propertyConfig.rich_text = {}
        break

      case 'number':
        propertyConfig.number = {
          format: prop.format || 'number'
        }
        break

      case 'select':
        propertyConfig.select = {
          options: (prop.options || []).map(opt => ({
            name: opt.name,
            color: opt.color || 'default'
          }))
        }
        break

      case 'multi_select':
        propertyConfig.multi_select = {
          options: (prop.options || []).map(opt => ({
            name: opt.name,
            color: opt.color || 'default'
          }))
        }
        break

      case 'status':
        propertyConfig.status = {
          options: (prop.options || []).map(opt => ({
            name: opt.name,
            color: opt.color || 'default'
          })),
          groups: [
            {
              name: 'To-do',
              color: 'gray',
              option_ids: []
            },
            {
              name: 'In progress',
              color: 'blue',
              option_ids: []
            },
            {
              name: 'Complete',
              color: 'green',
              option_ids: []
            }
          ]
        }
        break

      case 'date':
        propertyConfig.date = {}
        break

      case 'people':
        propertyConfig.people = {}
        break

      case 'files':
        propertyConfig.files = {}
        break

      case 'checkbox':
        propertyConfig.checkbox = {}
        break

      case 'url':
        propertyConfig.url = {}
        break

      case 'email':
        propertyConfig.email = {}
        break

      case 'phone_number':
        propertyConfig.phone_number = {}
        break

      case 'created_time':
        propertyConfig.created_time = {}
        break

      case 'created_by':
        propertyConfig.created_by = {}
        break

      case 'last_edited_time':
        propertyConfig.last_edited_time = {}
        break

      case 'last_edited_by':
        propertyConfig.last_edited_by = {}
        break

      default:
        // For formula, relation, rollup - these require more complex setup
        // For now, skip them in basic implementation
        continue
    }

    notionProperties[prop.name] = propertyConfig
  }

  return notionProperties
}

/**
 * Get default properties for a new database (mimics Notion's defaults)
 */
export function getDefaultDatabaseProperties(): DatabaseProperty[] {
  return [
    {
      name: 'Name',
      type: 'title'
    }
  ]
}

/**
 * Validate property configuration
 */
export function validateProperties(properties: DatabaseProperty[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Must have at least one title property
  const titleProps = properties.filter(p => p.type === 'title')
  if (titleProps.length === 0) {
    errors.push('Database must have at least one Title property')
  }
  if (titleProps.length > 1) {
    errors.push('Database can only have one Title property')
  }

  // Check for duplicate names
  const names = properties.map(p => p.name.toLowerCase())
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index)
  if (duplicates.length > 0) {
    errors.push(`Duplicate property names found: ${duplicates.join(', ')}`)
  }

  // Validate select/multi_select have options
  for (const prop of properties) {
    if ((prop.type === 'select' || prop.type === 'multi_select' || prop.type === 'status') &&
        (!prop.options || prop.options.length === 0)) {
      errors.push(`Property "${prop.name}" (${prop.type}) must have at least one option`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
