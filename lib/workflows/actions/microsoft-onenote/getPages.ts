import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

import { logger } from '@/lib/utils/logger'

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
    logger.debug("[TEST MODE] Would get OneNote pages:", { notebookId, sectionId, filter })
    return {
      success: true,
      output: {
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

    // Build query parameters helper
    const buildQueryParams = () => {
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
      queryParams.push("$select=id,title,createdDateTime,lastModifiedDateTime,level,order,links,parentSection")

      return queryParams.length > 0 ? `?${queryParams.join("&")}` : ""
    }

    let allPages: any[] = []

    if (sectionId) {
      // Fetch pages from a specific section
      const endpoint = `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages${buildQueryParams()}`
      const response = await makeGraphRequest(endpoint, accessToken)
      allPages = response.value || []
    } else if (notebookId) {
      // Microsoft Graph doesn't support /notebooks/{id}/pages directly
      // We need to first get all sections from the notebook, then get pages from each section
      const sectionsEndpoint = `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}/sections?$select=id,displayName`
      const sectionsResponse = await makeGraphRequest(sectionsEndpoint, accessToken)
      const sections = sectionsResponse.value || []

      // Fetch pages from all sections in parallel
      const pagesPerSection = Math.ceil((top || 20) / Math.max(sections.length, 1))
      const pagePromises = sections.map((section: any) => {
        const sectionQueryParams = []
        if (filter) sectionQueryParams.push(`$filter=${encodeURIComponent(filter)}`)
        if (orderBy) sectionQueryParams.push(`$orderby=${encodeURIComponent(orderBy)}`)
        sectionQueryParams.push(`$top=${pagesPerSection}`)
        sectionQueryParams.push("$select=id,title,createdDateTime,lastModifiedDateTime,level,order,links,parentSection")

        const endpoint = `https://graph.microsoft.com/v1.0/me/onenote/sections/${section.id}/pages?${sectionQueryParams.join("&")}`
        return makeGraphRequest(endpoint, accessToken).catch(() => ({ value: [] }))
      })

      const pagesResults = await Promise.all(pagePromises)
      allPages = pagesResults.flatMap(result => result.value || [])

      // Sort by the orderBy parameter and limit to top
      if (orderBy?.includes("lastModifiedDateTime")) {
        allPages.sort((a, b) => {
          const dateA = new Date(a.lastModifiedDateTime).getTime()
          const dateB = new Date(b.lastModifiedDateTime).getTime()
          return orderBy.includes("desc") ? dateB - dateA : dateA - dateB
        })
      }
      allPages = allPages.slice(0, top || 20)
    } else {
      // No filters - get all pages globally
      const endpoint = `https://graph.microsoft.com/v1.0/me/onenote/pages${buildQueryParams()}`
      const response = await makeGraphRequest(endpoint, accessToken)
      allPages = response.value || []
    }

    // Format the response
    const pages = allPages.map((page: any) => ({
      id: page.id,
      title: page.title,
      createdDateTime: page.createdDateTime,
      lastModifiedDateTime: page.lastModifiedDateTime,
      level: page.level,
      order: page.order,
      webUrl: page.links?.oneNoteWebUrl?.href,
      clientUrl: page.links?.oneNoteClientUrl?.href,
      sectionId: page.parentSection?.id,
      sectionName: page.parentSection?.displayName
    }))

    return {
      success: true,
      output: {
        pages,
        count: pages.length
      }
    }
  } catch (error: any) {
    logger.error("Error getting OneNote pages:", error)
    return {
      success: false,
      output: {},
      error: error.message || "Failed to get OneNote pages"
    }
  }
}