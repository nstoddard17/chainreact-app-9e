import { DropboxIntegration } from '../types'

export async function handleFiles(integration: DropboxIntegration, options: any = {}) {
  const { path = '' } = options

  try {
    // Get Dropbox access token
    const accessToken = integration.access_token
    if (!accessToken) {
      throw new Error('No Dropbox access token found')
    }

    // Fetch files from folder
    const url = 'https://api.dropboxapi.com/2/files/list_folder'

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: path || '',
        include_deleted: false,
        include_has_explicit_shared_members: false,
        include_mounted_folders: true,
        include_non_downloadable_files: false
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [Dropbox] Failed to fetch files:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        path
      })
      throw new Error(`Failed to fetch Dropbox files: ${response.statusText}`)
    }

    const data = await response.json()

    // Filter to only files (not folders)
    const files = (data.entries || []).filter((item: any) => item['.tag'] === 'file')

    // Format for dropdown
    const formattedFiles = files.map((file: any) => ({
      value: file.path_lower,
      label: file.name,
      metadata: {
        size: file.size,
        modified: file.client_modified
      }
    }))

    console.log(`✅ [Dropbox] Fetched ${formattedFiles.length} files from path '${path}'`)

    return formattedFiles
  } catch (error: any) {
    console.error('❌ [Dropbox] Error fetching files:', error)
    throw error
  }
}
