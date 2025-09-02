import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'

/**
 * Lists records from an Airtable table
 */
export async function listAirtableRecords(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {

    
    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const maxRecords = resolveValue(config.maxRecords, input) || 100
    const filterByFormula = resolveValue(config.filterByFormula, input)
    
    // New filter parameters
    const keywordSearch = resolveValue(config.keywordSearch, input)
    const filterField = resolveValue(config.filterField, input)
    const filterValue = resolveValue(config.filterValue, input)
    const sortOrder = resolveValue(config.sortOrder, input) || 'desc'
    const dateFilter = resolveValue(config.dateFilter, input)
    const customDateRange = resolveValue(config.customDateRange, input)
    const recordLimit = resolveValue(config.recordLimit, input)

    if (!baseId || !tableName) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!tableName) missingFields.push("Table Name")
      
      const message = `Missing required fields for listing records: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }

    // Build combined filter formula using AND logic
    const filterConditions: string[] = []
    
    // Add existing filterByFormula if provided
    if (filterByFormula && filterByFormula.trim()) {
      filterConditions.push(`(${filterByFormula})`)
    }
    
    // Note: Keyword search will be implemented as post-processing for now
    // TODO: Enhance to use actual table schema to search across all text fields
    let keywordSearchTerm = null
    if (keywordSearch && keywordSearch.trim()) {
      keywordSearchTerm = keywordSearch.trim().toLowerCase()
    }
    
    // Add field-specific filtering
    if (filterField && filterValue) {
      // Check if filterValue contains both ID and name (format: "recXXX::Name")
      // This indicates we're filtering by a linked record field
      const isLinkedRecordFilter = typeof filterValue === 'string' && filterValue.includes('::');
      
      
      if (isLinkedRecordFilter) {
        // Extract the record ID and name from the combined value
        const [recordId, recordName] = filterValue.split('::');
        
        // For linked record fields in Airtable, we filter by the display name
        // Airtable's API will match this against the primary field of the linked table
        const linkedFilter = `{${filterField}} = "${recordName}"`
        
        filterConditions.push(linkedFilter)
      } else {
        // For regular fields, use standard equality check
        const regularFilter = `{${filterField}} = "${filterValue}"`
        filterConditions.push(regularFilter)
      }
    }
    
    // Add date filter based on selected option
    if (dateFilter) {
      let dateFormula = ''
      const today = new Date()
      
      switch(dateFilter) {
        case 'today':
          dateFormula = `IS_SAME(CREATED_TIME(), TODAY(), 'day')`
          break
        case 'yesterday':
          const yesterday = new Date(today)
          yesterday.setDate(today.getDate() - 1)
          dateFormula = `IS_SAME(CREATED_TIME(), '${yesterday.toISOString().split('T')[0]}', 'day')`
          break
        case 'last_7_days':
          const sevenDaysAgo = new Date(today)
          sevenDaysAgo.setDate(today.getDate() - 7)
          dateFormula = `CREATED_TIME() >= '${sevenDaysAgo.toISOString().split('T')[0]}'`
          break
        case 'last_30_days':
          const thirtyDaysAgo = new Date(today)
          thirtyDaysAgo.setDate(today.getDate() - 30)
          dateFormula = `CREATED_TIME() >= '${thirtyDaysAgo.toISOString().split('T')[0]}'`
          break
        case 'this_month':
          const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
          dateFormula = `CREATED_TIME() >= '${firstDayThisMonth.toISOString().split('T')[0]}'`
          break
        case 'last_month':
          const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
          const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
          dateFormula = `AND(CREATED_TIME() >= '${firstDayLastMonth.toISOString().split('T')[0]}', CREATED_TIME() <= '${lastDayLastMonth.toISOString().split('T')[0]}')`
          break
        case 'custom_date_range':
          if (customDateRange && customDateRange.from && customDateRange.to) {
            const fromDate = new Date(customDateRange.from).toISOString().split('T')[0]
            const toDate = new Date(customDateRange.to).toISOString().split('T')[0]
            dateFormula = `AND(CREATED_TIME() >= '${fromDate}', CREATED_TIME() <= '${toDate}')`
          }
          break
      }
      
      if (dateFormula) {
        filterConditions.push(dateFormula)
      }
    }
    
    // Combine all conditions with AND logic
    let combinedFilter = ''
    if (filterConditions.length > 0) {
      combinedFilter = filterConditions.length === 1 
        ? filterConditions[0] 
        : `AND(${filterConditions.join(', ')})`
    }
    

    // Build the URL with query parameters
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`)
    
    // Handle record limit options
    let effectiveMaxRecords = 100  // Default fallback
    
    if (recordLimit && recordLimit !== '') {
      switch(recordLimit) {
        case 'last_10':
          effectiveMaxRecords = 10
          break
        case 'last_20':
          effectiveMaxRecords = 20
          break
        case 'last_50':
          effectiveMaxRecords = 50
          break
        case 'last_100':
          effectiveMaxRecords = 100
          break
        case 'custom':
          // Use the maxRecords value when custom is selected (maxRecords field is visible)
          effectiveMaxRecords = maxRecords || 100
          break
        default:
          effectiveMaxRecords = 100
          break
      }
    } else {
      // When recordLimit is empty ("Use Max Records setting"), use a default since maxRecords field is hidden
      effectiveMaxRecords = 100
    }
    
    url.searchParams.append('maxRecords', effectiveMaxRecords.toString())
    
    if (combinedFilter) {
      url.searchParams.append('filterByFormula', combinedFilter)
    }
    
    // Add sorting based on sort order option
    if (sortOrder) {
      let sortField = 'Created'
      let sortDirection = 'desc'
      
      switch(sortOrder) {
        case 'newest':
          sortField = 'Created'
          sortDirection = 'desc'
          break
        case 'oldest':
          sortField = 'Created'
          sortDirection = 'asc'
          break
        case 'recently_modified':
          sortField = 'Last Modified'
          sortDirection = 'desc'
          break
        case 'least_recently_modified':
          sortField = 'Last Modified'
          sortDirection = 'asc'
          break
        default:
          sortField = 'Created'
          sortDirection = 'desc'
      }
      
      url.searchParams.append('sort[0][field]', sortField)
      url.searchParams.append('sort[0][direction]', sortDirection)
    }


    // Fetch the records from Airtable
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to list records: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()
    

    // Apply keyword search post-processing if needed
    let filteredRecords = result.records || []
    if (keywordSearchTerm && filteredRecords.length > 0) {
      filteredRecords = filteredRecords.filter((record: any) => {
        if (!record.fields) return false
        
        // Search across all field values
        const fieldValues = Object.values(record.fields).map(value => {
          if (typeof value === 'string') return value.toLowerCase()
          if (Array.isArray(value)) return value.map(v => String(v).toLowerCase()).join(' ')
          return String(value).toLowerCase()
        }).join(' ')
        
        return fieldValues.includes(keywordSearchTerm)
      })
      
    }

    return {
      success: true,
      output: {
        records: filteredRecords,
        count: filteredRecords.length,
        offset: result.offset,
        tableName: tableName,
        baseId: baseId,
        maxRecords: effectiveMaxRecords,
        filterByFormula: combinedFilter,
        appliedFilters: {
          keywordSearch,
          filterField,
          filterValue,
          dateFilter,
          customDateRange,
          recordLimit,
          sortOrder
        },
      },
      message: `Successfully listed ${filteredRecords.length} records from ${tableName}${keywordSearchTerm ? ` (filtered by keyword: "${keywordSearchTerm}")` : ''}`
    }

  } catch (error: any) {
    console.error("Airtable list records error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while listing records"
    }
  }
} 