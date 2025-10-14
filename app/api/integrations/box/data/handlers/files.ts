import { BoxIntegration } from '../types'

import { logger } from '@/lib/utils/logger'

export interface BoxFile {
  id: string
  name: string
  type: 'file'
  size: number
  modified_at: string
}

export async function handleFiles(integration: BoxIntegration, options: any = {}) {
  const { folderId = '0' } = options

  try {
    // Get Box access token
    const accessToken = integration.access_token
    if (!accessToken) {
      throw new Error('No Box access token found')
    }

    // Fetch files from folder
    const url = `https://api.box.com/2.0/folders/${folderId}/items?fields=id,name,type,size,modified_at`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('❌ [Box] Failed to fetch files:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        folderId
      })
      throw new Error(`Failed to fetch Box files: ${response.statusText}`)
    }

    const data = await response.json()

    // Filter to only files (not folders)
    const files = (data.entries || []).filter((item: any) => item.type === 'file')

    // Format for dropdown
    const formattedFiles = files.map((file: any) => ({
      value: file.id,
      label: file.name,
      metadata: {
        size: file.size,
        modified_at: file.modified_at
      }
    }))

    logger.debug(`✅ [Box] Fetched ${formattedFiles.length} files from folder ${folderId}`)

    return formattedFiles
  } catch (error: any) {
    logger.error('❌ [Box] Error fetching files:', error)
    throw error
  }
}
