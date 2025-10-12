import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

import { logger } from '@/lib/utils/logger'
const ExcelJS = require('exceljs')

/**
 * Creates a new Microsoft Excel workbook in OneDrive using the Microsoft Graph API
 */
export async function createMicrosoftExcelWorkbook(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration with workflow variables
    const resolvedConfig = resolveValue(config, { input })
    const {
      title,
      description,
      folderPath,
      worksheets = [],
      template = 'blank',
      initialData
    } = resolvedConfig

    // Get access token for OneDrive (Microsoft Graph API)
    const accessToken = await getDecryptedAccessToken(userId, 'onedrive')
    if (!accessToken) {
      throw new Error('No OneDrive access token found. Please connect your OneDrive account.')
    }

    // Validate required fields
    if (!title) {
      throw new Error('Workbook title is required')
    }

    // Ensure title has .xlsx extension and add timestamp to avoid conflicts
    const baseTitle = title.endsWith('.xlsx') ? title.replace('.xlsx', '') : title
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5) // Format: YYYY-MM-DDTHH-MM-SS
    const workbookName = `${baseTitle}_${timestamp}.xlsx`

    // Microsoft Graph API base URL
    const baseUrl = 'https://graph.microsoft.com/v1.0/me/drive'

    // Create the workbook file URL based on folder path
    let createUrl: string
    if (folderPath) {
      // If a folder path is specified, create in that folder
      createUrl = `${baseUrl}/root:/${folderPath}/${workbookName}:/content`
    } else {
      // If no folder specified, create in root
      createUrl = `${baseUrl}/root:/${workbookName}:/content`
    }

    logger.debug(`📊 [Excel Create] Creating workbook at: ${createUrl}`)

    // First, create an empty Excel file using proper XLSX structure
    // We'll use the ExcelJS library or create a minimal valid structure
    const excelContent = await createValidExcelFile()

    const createResponse = await fetch(createUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Length': excelContent.length.toString()
      },
      body: excelContent
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      logger.error(`❌ [Excel Create] Graph API error: ${createResponse.status} - ${errorText}`)
      throw new Error(`Failed to create workbook: ${createResponse.status} - ${errorText}`)
    }

    const createdFile = await createResponse.json()
    logger.debug(`✅ [Excel Create] Workbook created successfully with ID: ${createdFile.id}`)
    const workbookId = createdFile.id

    // Wait a moment for the file to be fully processed by OneDrive
    // This helps avoid the "resourceLocked" error
    logger.debug(`⏳ [Excel Create] Waiting for file to be ready...`)
    await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay

    // Now work with the created workbook
    const workbookUrl = `${baseUrl}/items/${workbookId}/workbook`

    // Apply template if not blank
    if (template !== 'blank') {
      // Add template-specific worksheets and data
      const templateSheets = getTemplateSheets(template)
      worksheets.push(...templateSheets)
    }

    // Add custom worksheets if specified
    let worksheetsCreated = 1 // Default Sheet1 is already created
    if (worksheets && worksheets.length > 0) {
      for (const sheet of worksheets) {
        if (sheet.name && sheet.name !== 'Sheet1') {
          try {
            // Add a new worksheet with retry logic
            const addSheetResponse = await fetch(`${workbookUrl}/worksheets/add`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: sheet.name
              })
            })

            if (addSheetResponse.ok) {
              worksheetsCreated++

              // If the sheet has initial data, add it
              if (sheet.data && sheet.data.length > 0) {
                await populateWorksheet(workbookUrl, sheet.name, sheet.data, accessToken)
              }
            } else if (addSheetResponse.status === 423) {
              // Resource locked, skip adding worksheets for now
              logger.debug(`⚠️ [Excel Create] File still locked, skipping worksheet creation`)
              break
            }
          } catch (err) {
            logger.debug(`⚠️ [Excel Create] Could not add worksheet: ${err}`)
          }
        }
      }
    }

    // Add initial data to the first worksheet if provided
    if (initialData) {
      try {
        const dataRows = parseCSV(initialData)
        if (dataRows.length > 0) {
          await populateWorksheet(workbookUrl, 'Sheet1', dataRows, accessToken)
        }
      } catch (err) {
        logger.debug(`⚠️ [Excel Create] Could not add initial data: ${err}`)
      }
    }

    // Add description as a comment or metadata if provided
    if (description) {
      // Note: Graph API doesn't directly support workbook descriptions,
      // but we could add it as a comment in cell A1 or as file metadata
      try {
        await fetch(`${baseUrl}/items/${workbookId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            description: description
          })
        })
      } catch (err) {
        // Non-critical error, continue
        logger.debug('Could not add description to workbook metadata')
      }
    }

    // Get the actual file metadata to get the proper web URL
    try {
      const fileResponse = await fetch(`${baseUrl}/items/${workbookId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      let webUrl = `https://onedrive.live.com/edit.aspx?resid=${workbookId}`
      if (fileResponse.ok) {
        const fileData = await fileResponse.json()
        webUrl = fileData.webUrl || webUrl
      }

      return {
        success: true,
        output: {
          workbookId,
          workbookUrl: webUrl,
          title: workbookName,
          worksheetsCreated,
          timestamp: new Date().toISOString()
        },
        message: `Successfully created workbook "${workbookName}" in OneDrive`
      }
    } catch (err) {
      // Even if we can't get the web URL, the file was created successfully
      return {
        success: true,
        output: {
          workbookId,
          workbookUrl: `https://onedrive.live.com/edit.aspx?resid=${workbookId}`,
          title: workbookName,
          worksheetsCreated,
          timestamp: new Date().toISOString()
        },
        message: `Successfully created workbook "${workbookName}" in OneDrive`
      }
    }

  } catch (error: any) {
    logger.error('❌ [Microsoft Excel Create Workbook] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create Excel workbook'
    }
  }
}

/**
 * Helper function to populate a worksheet with data
 */
async function populateWorksheet(
  workbookUrl: string,
  worksheetName: string,
  data: any[][],
  accessToken: string
): Promise<void> {
  if (!data || data.length === 0) return

  const numRows = data.length
  const numCols = Math.max(...data.map(row => row.length))

  // Convert to Excel range notation (e.g., A1:C10)
  const endColumn = String.fromCharCode(65 + numCols - 1)
  const rangeAddress = `A1:${endColumn}${numRows}`

  const updateUrl = `${workbookUrl}/worksheets('${worksheetName}')/range(address='${rangeAddress}')`

  await fetch(updateUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: data
    })
  })
}

/**
 * Helper function to parse CSV data
 */
function parseCSV(csvData: string): any[][] {
  if (!csvData) return []

  const lines = csvData.trim().split('\n')
  return lines.map(line => {
    // Simple CSV parsing (doesn't handle quoted commas)
    // For production, use a proper CSV parser
    return line.split(',').map(cell => cell.trim())
  })
}

/**
 * Helper function to get template-specific sheets
 */
function getTemplateSheets(template: string): any[] {
  switch (template) {
    case 'budget':
      return [{
        name: 'Budget',
        data: [
          ['Category', 'Planned', 'Actual', 'Difference'],
          ['Income', '', '', '=B2-C2'],
          ['Housing', '', '', '=B3-C3'],
          ['Transportation', '', '', '=B4-C4'],
          ['Food', '', '', '=B5-C5'],
          ['Utilities', '', '', '=B6-C6'],
          ['Insurance', '', '', '=B7-C7'],
          ['Savings', '', '', '=B8-C8'],
          ['Personal', '', '', '=B9-C9'],
          ['Entertainment', '', '', '=B10-C10'],
          ['Total', '=SUM(B2:B10)', '=SUM(C2:C10)', '=B11-C11']
        ]
      }]

    case 'project':
      return [{
        name: 'Tasks',
        data: [
          ['Task ID', 'Task Name', 'Assignee', 'Status', 'Priority', 'Due Date', 'Notes'],
          ['1', 'Project Kickoff', '', 'Not Started', 'High', '', ''],
          ['2', 'Requirements Gathering', '', 'Not Started', 'High', '', ''],
          ['3', 'Design Phase', '', 'Not Started', 'Medium', '', ''],
          ['4', 'Development', '', 'Not Started', 'High', '', ''],
          ['5', 'Testing', '', 'Not Started', 'High', '', ''],
          ['6', 'Deployment', '', 'Not Started', 'Medium', '', '']
        ]
      }]

    case 'crm':
      return [{
        name: 'Contacts',
        data: [
          ['ID', 'First Name', 'Last Name', 'Company', 'Email', 'Phone', 'Status', 'Last Contact', 'Notes']
        ]
      }, {
        name: 'Companies',
        data: [
          ['ID', 'Company Name', 'Industry', 'Website', 'Main Contact', 'Phone', 'Address', 'Notes']
        ]
      }]

    case 'inventory':
      return [{
        name: 'Inventory',
        data: [
          ['SKU', 'Product Name', 'Category', 'Quantity', 'Unit Cost', 'Total Value', 'Reorder Level', 'Supplier'],
          ['', '', '', '', '', '=D2*E2', '', ''],
          ['', '', '', '', '', '=D3*E3', '', ''],
          ['', '', '', '', '', '=D4*E4', '', '']
        ]
      }]

    case 'calendar':
      return [{
        name: 'Content Calendar',
        data: [
          ['Date', 'Title', 'Type', 'Channel', 'Status', 'Author', 'Notes']
        ]
      }]

    default:
      return []
  }
}

/**
 * Create a valid Excel file using ExcelJS
 */
async function createValidExcelFile(): Promise<Buffer> {
  // Create a new workbook with ExcelJS
  const workbook = new ExcelJS.Workbook()

  // Set workbook properties
  workbook.creator = 'ChainReact Workflow'
  workbook.lastModifiedBy = 'ChainReact'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.lastPrinted = new Date()

  // Add a default worksheet
  const worksheet = workbook.addWorksheet('Sheet1')

  // Set up columns without adding any data
  worksheet.columns = [
    { width: 15 },
    { width: 15 },
    { width: 15 }
  ]

  // Ensure the worksheet has at least one row (but empty)
  // This helps Excel recognize it as a valid worksheet
  worksheet.addRow([])

  // Generate the Excel file buffer
  const buffer = await workbook.xlsx.writeBuffer()

  return Buffer.from(buffer)
}