import { AirtableTableSchema, AirtableFieldSchema } from './predefinedTemplates'

/**
 * Generates a CSV string for importing table structure into Airtable
 * Airtable CSV import format: First row is field names, subsequent rows are data
 * Field type information is embedded in the header row
 */
export function generateAirtableCSV(table: AirtableTableSchema): string {
  const headers = table.fields.map(field => field.name)
  const csvLines = [headers.join(',')]

  // Add a sample row with field type hints in parentheses
  const sampleRow = table.fields.map(field => {
    const typeHint = getFieldTypeHint(field)
    return `(${typeHint})`
  })
  csvLines.push(sampleRow.join(','))

  return csvLines.join('\n')
}

/**
 * Gets a human-readable type hint for a field
 */
function getFieldTypeHint(field: AirtableFieldSchema): string {
  switch (field.type) {
    case 'singleLineText':
      return 'Single line text'
    case 'longText':
      return 'Long text'
    case 'singleSelect':
      return field.options ? `Single select: ${field.options.join('/')}` : 'Single select'
    case 'multipleSelects':
      return field.options ? `Multiple select: ${field.options.join('/')}` : 'Multiple select'
    case 'number':
      return 'Number'
    case 'email':
      return 'Email'
    case 'url':
      return 'URL'
    case 'checkbox':
      return 'Checkbox'
    case 'date':
      return 'Date'
    case 'phoneNumber':
      return 'Phone number'
    case 'multipleAttachments':
      return 'Attachments'
    default:
      return field.type
  }
}

/**
 * Generates a markdown guide for setting up Airtable tables manually
 */
export function generateSetupGuide(baseName: string, tables: AirtableTableSchema[]): string {
  let guide = `# Airtable Setup Guide: ${baseName}\n\n`
  guide += `This template requires ${tables.length} Airtable table${tables.length > 1 ? 's' : ''} to function properly.\n\n`
  guide += `## Quick Setup Options\n\n`
  guide += `### Option 1: CSV Import (Recommended)\n`
  guide += `1. Create a new Airtable base named "${baseName}"\n`
  guide += `2. Download the CSV files for each table (buttons below)\n`
  guide += `3. In Airtable, delete the default "Table 1"\n`
  guide += `4. For each CSV file:\n`
  guide += `   - Click "Add or import" → "CSV file"\n`
  guide += `   - Upload the CSV file\n`
  guide += `   - Configure field types based on the hints in the CSV\n\n`
  guide += `### Option 2: Manual Setup\n`
  guide += `Follow the detailed table specifications below.\n\n`
  guide += `---\n\n`

  tables.forEach((table, index) => {
    guide += `## Table ${index + 1}: ${table.tableName}\n\n`
    if (table.description) {
      guide += `**Purpose:** ${table.description}\n\n`
    }
    guide += `### Fields\n\n`
    guide += `| Field Name | Type | Options | Description |\n`
    guide += `|------------|------|---------|-------------|\n`

    table.fields.forEach(field => {
      const options = field.options ? field.options.join(', ') : '-'
      const description = field.description || '-'
      guide += `| ${field.name} | ${getFieldTypeHint(field)} | ${options} | ${description} |\n`
    })

    guide += `\n`
  })

  guide += `## After Setup\n\n`
  guide += `1. Copy your Base ID from Airtable (found in the API documentation for your base)\n`
  guide += `2. Return to ChainReact and configure each Airtable action with:\n`
  guide += `   - Your Base ID\n`
  guide += `   - The corresponding table name\n`
  guide += `3. Connect your Airtable account in ChainReact if you haven't already\n`
  guide += `4. Test your workflow in sandbox mode\n\n`
  guide += `## Need Help?\n\n`
  guide += `If you encounter any issues:\n`
  guide += `- Make sure field names match exactly (including capitalization)\n`
  guide += `- Verify that select field options include all values used in the workflow\n`
  guide += `- Check that your Airtable account is properly connected in ChainReact\n`

  return guide
}

/**
 * Generates a complete setup package with all files
 */
export function generateSetupPackage(baseName: string, tables: AirtableTableSchema[]): {
  csvFiles: { tableName: string; filename: string; content: string }[]
  markdownGuide: string
} {
  const csvFiles = tables.map(table => ({
    tableName: table.tableName,
    filename: `${baseName.toLowerCase().replace(/\s+/g, '-')}-${table.tableName.toLowerCase().replace(/\s+/g, '-')}.csv`,
    content: generateAirtableCSV(table)
  }))

  const markdownGuide = generateSetupGuide(baseName, tables)

  return {
    csvFiles,
    markdownGuide
  }
}
