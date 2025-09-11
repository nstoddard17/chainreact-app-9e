import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

export async function onenoteSearch(
  params: {
    searchQuery: string
    scope?: string
    notebookId?: string
    sectionId?: string
    maxResults?: number
  },
  context: ExecutionContext
) {
  const { searchQuery, scope = "all", notebookId, sectionId, maxResults = 20 } = params

  if (context.testMode) {
    console.log("[TEST MODE] Would search OneNote:", { searchQuery, scope })
    return {
      success: true,
      data: {
        results: [
          {
            id: "test-page-1",
            title: "Test Result Page",
            snippet: "...matching content...",
            notebookName: "Test Notebook",
            sectionName: "Test Section"
          }
        ],
        count: 1
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)
    
    // OneNote search is done through filtering pages by title
    // Note: Direct OneNote search API has limitations, so we'll use title filtering
    
    let results = []
    
    if (scope === "section" && sectionId) {
      // Search within a specific section
      const pages = await makeGraphRequest(
        `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages?$select=id,title,createdDateTime,lastModifiedDateTime&$top=100`,
        accessToken
      )
      
      // Simple client-side filtering (in production, you might want server-side search)
      results = pages.value?.filter((page: any) => 
        page.title?.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, maxResults) || []
      
    } else if (scope === "notebook" && notebookId) {
      // Search within a specific notebook
      const pages = await makeGraphRequest(
        `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}/pages?$select=id,title,createdDateTime,lastModifiedDateTime,parentSection&$top=100`,
        accessToken
      )
      
      results = pages.value?.filter((page: any) => 
        page.title?.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, maxResults) || []
      
    } else {
      // Search across all notebooks
      // Note: This is a simplified implementation. For production, consider using
      // Microsoft Search API or implementing pagination for large note collections
      const pages = await makeGraphRequest(
        `https://graph.microsoft.com/v1.0/me/onenote/pages?$select=id,title,createdDateTime,lastModifiedDateTime,parentSection&$top=100&$filter=contains(title, '${searchQuery}')`,
        accessToken
      )
      
      results = pages.value?.slice(0, maxResults) || []
    }

    // Format the results
    const formattedResults = results.map((page: any) => ({
      id: page.id,
      title: page.title,
      createdDateTime: page.createdDateTime,
      lastModifiedDateTime: page.lastModifiedDateTime,
      webUrl: page.links?.oneNoteWebUrl?.href,
      parentSection: page.parentSection?.displayName
    }))

    return {
      success: true,
      data: {
        results: formattedResults,
        count: formattedResults.length,
        query: searchQuery
      }
    }
  } catch (error: any) {
    console.error("Error searching OneNote:", error)
    return {
      success: false,
      error: error.message || "Failed to search OneNote"
    }
  }
}