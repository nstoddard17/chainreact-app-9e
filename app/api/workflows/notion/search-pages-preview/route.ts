import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { config, userId } = await request.json()

    if (!config) {
      return NextResponse.json(
        { error: "Config is required" },
        { status: 400 }
      )
    }

    // Validate required fields
    const { query, filter, maxResults } = config
    
    if (!query && !filter) {
      return NextResponse.json(
        { error: "Either query or filter is required" },
        { status: 400 }
      )
    }

    // For preview, we need to get the actual user's Notion integration
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required for Notion preview" },
        { status: 400 }
      )
    }

    // Import the search function dynamically to avoid import issues
    const { searchNotionPages } = await import("../../../../../lib/workflows/actions/notion")

    try {
      // Call the search action with empty input (no workflow context needed for preview)
      const result = await searchNotionPages(config, userId, {})

      if (!result.success) {
        // Handle the case where user doesn't have Notion integration
        if (result.message?.includes("Notion access token not found") || 
            result.error?.includes("JSON object requested, multiple (or no) rows returned") ||
            result.error?.includes("no rows returned")) {
          return NextResponse.json({
            success: false,
            error: "No Notion integration found. Please connect your Notion account first.",
            data: {
              pages: [],
              count: 0,
              query: config.query || "",
              filter: config.filter || "page",
              maxResults: config.maxResults || 10
            }
          }, { status: 400 })
        }
        
        return NextResponse.json(
          { error: result.message || "Failed to fetch Notion pages" },
          { status: 500 }
        )
      }

      // Return structured preview data
      return NextResponse.json({
        success: true,
        data: {
          pages: result.output?.pages || [],
          count: result.output?.count || 0,
          query: result.output?.query || "",
          filter: result.output?.filter || "page",
          maxResults: result.output?.maxResults || 10,
          message: result.message
        }
      })
    } catch (error: any) {
      // Handle the case where user doesn't have Notion integration
      if (error.message?.includes("JSON object requested, multiple (or no) rows returned") || 
          error.message?.includes("no rows returned")) {
        return NextResponse.json({
          success: false,
          error: "No Notion integration found. Please connect your Notion account first.",
          data: {
            pages: [],
            count: 0,
            query: config.query || "",
            filter: config.filter || "page",
            maxResults: config.maxResults || 10
          }
        }, { status: 400 })
      }
      
      // Re-throw other errors to be handled by the outer catch block
      throw error
    }

  } catch (error: any) {
    console.error("Notion search pages preview error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
} 