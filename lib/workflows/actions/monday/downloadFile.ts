import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Download/get file URLs from a Monday.com item
 */
export async function downloadMondayFile(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const itemId = await resolveValue(config.itemId, input)
    const columnId = await resolveValue(config.columnId, input)
    const fileId = await resolveValue(config.fileId, input)
    const useItemFiles = !columnId || columnId === '__item_files__'

    // Validate required fields
    if (!itemId) {
      throw new Error('Item ID is required')
    }
    if (!columnId && !fileId) {
      throw new Error('File Column or File ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    let items: any[] = []
    if (useItemFiles) {
      const query = `
        query($itemId: [ID!]) {
          items(ids: $itemId) {
            id
            name
            column_values {
              id
              type
              value
            }
            assets {
              id
              name
              url
              public_url
              file_size
              file_extension
            }
            updates(limit: 100) {
              id
              assets {
                id
                name
                url
                public_url
                file_size
                file_extension
              }
            }
          }
        }
      `

      const variables = { itemId: [itemId.toString()] }

      const response = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'API-Version': '2024-01'
        },
        body: JSON.stringify({ query, variables })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Monday.com API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()

      if (data.errors && data.errors.length > 0) {
        const errorMessages = data.errors.map((e: any) => e.message).join(', ')
        throw new Error(`Monday.com error: ${errorMessages}`)
      }

      items = data.data?.items || []
    } else {
      // Build GraphQL query to get file column value
      const query = `
        query($itemId: [ID!]) {
          items(ids: $itemId) {
            id
            name
            column_values {
              id
              type
              text
              value
            }
          }
        }
      `

      const variables = {
        itemId: [itemId.toString()]
      }

      // Make API request
      const response = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'API-Version': '2024-01'
        },
        body: JSON.stringify({ query, variables })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Monday.com API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()

      if (data.errors && data.errors.length > 0) {
        const errorMessages = data.errors.map((e: any) => e.message).join(', ')
        throw new Error(`Monday.com error: ${errorMessages}`)
      }

      items = data.data?.items || []
    }

    if (!items || items.length === 0) {
      throw new Error('Item not found')
    }

    const item = items[0]
    let asset: any = null
    const requestedFileId = fileId
    if (useItemFiles) {
      const assets = item.assets || []
      const updateAssets = (item.updates || []).flatMap((update: any) => update.assets || [])
      let columnAssets: any[] = []
      let columnFileUrls: string[] = []
      if (item.column_values) {
        const fileColumns = item.column_values.filter((col: any) => col.type === 'file' && col.value)
        fileColumns.forEach((col: any) => {
          try {
            const parsed = JSON.parse(col.value)
            const files = parsed?.files || []
            files.forEach((file: any) => {
              const assetId = file.assetId || file.id
              if (assetId) {
                columnAssets.push({ id: assetId })
              }
              const url = file.public_url || file.publicUrl || file.url
              if (url) {
                columnFileUrls.push(url)
              }
            })
          } catch {
            // ignore parse errors
          }
        })
      }
      if (columnAssets.length > 0) {
        const assetIds = Array.from(new Set(columnAssets.map(a => a.id.toString())))
        const assetQuery = `
          query($assetIds: [ID!]) {
            assets(ids: $assetIds) {
              id
              name
              url
              public_url
              file_size
              file_extension
            }
          }
        `
        const assetResponse = await fetch('https://api.monday.com/v2', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'API-Version': '2024-01'
          },
          body: JSON.stringify({ query: assetQuery, variables: { assetIds } })
        })
        if (assetResponse.ok) {
          const assetData = await assetResponse.json()
          if (!assetData.errors) {
            columnAssets = assetData.data?.assets || []
          }
        }
      }

      const probe = {
        itemId,
        assetsCount: assets.length,
        updateAssetsCount: updateAssets.length,
        fileColumnsCount: item.column_values ? item.column_values.filter((col: any) => col.type === 'file').length : 0,
        columnAssetIdsCount: columnAssets.length,
        columnFileUrlsCount: columnFileUrls.length,
        sample: {
          assets: assets.slice(0, 2),
          updateAssets: updateAssets.slice(0, 2),
          fileColumns: (item.column_values || []).filter((col: any) => col.type === 'file').slice(0, 2)
        }
      }
      logger.info('[Monday] File probe result', probe)

      const combinedAssets = [...assets, ...updateAssets, ...columnAssets]
      if (!combinedAssets.length) {
        if (columnFileUrls.length > 0) {
          asset = {
            id: requestedFileId || 'unknown',
            name: 'file',
            url: columnFileUrls[0],
            public_url: columnFileUrls[0],
            file_size: null,
            file_extension: null
          }
        } else {
          const error = new Error('No files found on the item') as Error & { details?: any }
          error.details = { probe }
          throw error
        }
      }
      if (!asset) {
        asset = requestedFileId
          ? combinedAssets.find((file: any) => file.id?.toString() === requestedFileId.toString())
          : combinedAssets[0]
      }
      if (!asset) {
        throw new Error(`File ${requestedFileId} not found on the item`)
      }
    } else {
      const fileColumn = item.column_values?.find((col: any) => col.id === columnId.toString())

      if (!fileColumn) {
        throw new Error(`Column ${columnId} not found on item`)
      }

      if (fileColumn.type !== 'file') {
        throw new Error(`Column ${columnId} is not a file column (type: ${fileColumn.type})`)
      }

      // Parse file value
      let files = []
      if (fileColumn.value) {
        try {
          const parsedValue = JSON.parse(fileColumn.value)
          files = parsedValue.files || []
        } catch (e) {
          logger.warn('Failed to parse file column value')
        }
      }

      if (!files.length) {
        throw new Error(`No files found in column ${columnId}`)
      }

      const targetFile = requestedFileId
        ? files.find((file: any) => file.id?.toString() === requestedFileId.toString() || file.assetId?.toString() === requestedFileId.toString())
        : files[0]

      if (!targetFile) {
        throw new Error(`File ${requestedFileId} not found in column ${columnId}`)
      }

      const assetId = targetFile.assetId || targetFile.id
      if (!assetId) {
        throw new Error('Unable to determine asset ID for selected file')
      }

      const assetQuery = `
        query($assetIds: [ID!]) {
          assets(ids: $assetIds) {
            id
            name
            url
            public_url
            file_size
          file_extension
          }
        }
      `

      const assetResponse = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'API-Version': '2024-01'
        },
        body: JSON.stringify({ query: assetQuery, variables: { assetIds: [assetId.toString()] } })
      })

      if (!assetResponse.ok) {
        const errorText = await assetResponse.text()
        throw new Error(`Monday.com API error: ${assetResponse.status} - ${errorText}`)
      }

      const assetData = await assetResponse.json()
      if (assetData.errors && assetData.errors.length > 0) {
        const errorMessages = assetData.errors.map((e: any) => e.message).join(', ')
        throw new Error(`Monday.com error: ${errorMessages}`)
      }

      asset = assetData.data?.assets?.[0]
      if (!asset) {
        throw new Error('File asset not found')
      }
    }

    logger.info('✅ Monday.com file retrieved successfully', { itemId, columnId, assetId: asset.id, userId })

    return {
      success: true,
      output: {
        fileId: asset.id,
        fileName: asset.name,
        fileUrl: asset.public_url || asset.url,
        fileSize: asset.file_size,
        mimeType: asset.file_extension
      },
      message: `Retrieved file "${asset.name}" from item ${itemId}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com download file error:', error)
    return {
      success: false,
      output: {
        errorDetails: error?.details
      },
      message: error.message || 'Failed to download Monday.com file'
    }
  }
}
