import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

export async function onenoteGetPages(
  params: {
    notebookId?: string
    sectionId?: string
    filter?: string
    orderBy?: string
    top?: number
  },
  context: ExecutionContext
) {
  const { notebookId, sectionId, filter, orderBy = "lastModifiedDateTime desc", top = 20 } = params

  if (context.testMode) {
    console.log("[TEST MODE] Would get OneNote pages:", { notebookId, sectionId, filter })
    return {
      success: true,
      data: {
        pages: [
          {
            id: "test-page-1",
            title: "Test Page 1",
            createdDateTime: new Date().toISOString(),
            lastModifiedDateTime: new Date().toISOString()
          }
        ],
        count: 1
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)
    
    // Build the endpoint based on parameters
    let endpoint = "https://graph.microsoft.com/v1.0/me/onenote/pages"
    
    if (sectionId) {
      endpoint = `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`
    } else if (notebookId) {
      endpoint = `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}/pages`
    }

    // Build query parameters
    const queryParams = []
    
    if (filter) {
      queryParams.push(`$filter=${encodeURIComponent(filter)}`)
    }
    
    if (orderBy) {
      queryParams.push(`$orderby=${encodeURIComponent(orderBy)}`)
    }
    
    if (top) {
      queryParams.push(`$top=${top}`)
    }
    
    // Always select specific fields for consistency
    queryParams.push("$select=id,title,createdDateTime,lastModifiedDateTime,level,order,links")
    
    if (queryParams.length > 0) {
      endpoint += `?${queryParams.join("&")}`
    }

    // Get the pages
    const response = await makeGraphRequest(endpoint, accessToken)

    // Format the response
    const pages = response.value?.map((page: any) => ({
      id: page.id,
      title: page.title,
      createdDateTime: page.createdDateTime,
      lastModifiedDateTime: page.lastModifiedDateTime,
      level: page.level,
      order: page.order,
      webUrl: page.links?.oneNoteWebUrl?.href,
      clientUrl: page.links?.oneNoteClientUrl?.href
    })) || []

    return {
      success: true,
      data: {
        pages,
        count: pages.length,
        nextLink: response["@odata.nextLink"]
      }
    }
  } catch (error: any) {
    console.error("Error getting OneNote pages:", error)
    return {
      success: false,
      error: error.message || "Failed to get OneNote pages"
    }
  }
}