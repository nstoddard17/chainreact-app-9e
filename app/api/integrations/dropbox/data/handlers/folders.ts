/**
 * Dropbox Folders Handler
 */

import { DropboxIntegration, DropboxFolder, DropboxDataHandler, DropboxEntry } from '../types'
import { validateDropboxIntegration, validateDropboxToken, makeDropboxApiRequest, parseDropboxApiResponse, buildDropboxApiUrl, createListFolderRequestBody } from '../utils'

export const getDropboxFolders: DropboxDataHandler<DropboxFolder> = async (integration: DropboxIntegration, options: any = {}): Promise<DropboxFolder[]> => {
  console.log("🔍 Dropbox folders fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
  })
  
  try {
    // Validate integration status
    validateDropboxIntegration(integration)
    
    console.log(`🔍 Validating Dropbox token...`)
    const tokenResult = await validateDropboxToken(integration)
    
    if (!tokenResult.success) {
      console.log(`❌ Dropbox token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    console.log('🔍 Fetching Dropbox folders...')
    
    const apiUrl = buildDropboxApiUrl('/files/list_folder')
    const requestBody = createListFolderRequestBody(options)
    
    const response = await makeDropboxApiRequest(apiUrl, tokenResult.token!, {
      method: 'POST',
      body: JSON.stringify(requestBody)
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error(`❌ Dropbox API error: ${response.status}`, errorData)
      
      if (response.status === 401) {
        throw new Error('Dropbox authentication expired. Please reconnect your account.')
      } else {
        throw new Error(`Dropbox API error: ${response.status} - ${errorData.error_summary || "Unknown error"}`)
      }
    }
    
    const data = await response.json()
    
    // Filter and transform folders
    const folders = (data.entries || [])
      .filter((entry: DropboxEntry) => entry[".tag"] === "folder")
      .map((folder: DropboxEntry) => ({
        id: folder.path_lower,
        name: folder.name,
        value: folder.path_lower,
        path: folder.path_lower,
        created_time: null, // Dropbox doesn't provide creation time in list_folder
        modified_time: folder.server_modified || null,
        ".tag": folder[".tag"],
        path_lower: folder.path_lower,
        path_display: folder.path_display
      }))
    
    // Add root folder as an option
    folders.unshift({
      id: "",
      name: "Dropbox (Root)",
      value: "",
      path: "",
      created_time: null,
      modified_time: null,
      ".tag": "folder",
      path_lower: "",
      path_display: ""
    })
    
    console.log(`✅ Dropbox folders fetched successfully: ${folders.length} folders`)
    return folders
    
  } catch (error: any) {
    console.error("Error fetching Dropbox folders:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Dropbox authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Dropbox API rate limit exceeded. Please try again later.')
    }
    
    // Return just the root folder as a fallback
    console.log('🔄 Returning root folder as fallback...')
    return [
      {
        id: "",
        name: "Dropbox (Root)",
        value: "",
        path: "",
        created_time: null,
        modified_time: null,
        ".tag": "folder",
        path_lower: "",
        path_display: ""
      }
    ]
  }
}