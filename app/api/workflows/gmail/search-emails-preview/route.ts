import { NextRequest, NextResponse } from "next/server";
import { searchGmailEmails } from "@/lib/workflows/actions/gmail/searchEmails";

export async function POST(request: NextRequest) {
  try {
    const { config, userId } = await request.json();

    if (!config) {
      return NextResponse.json(
        { error: "Config is required" },
        { status: 400 }
      )
    }

    // Validate required fields
    const { query } = config
    
    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      )
    }

    // For preview, we need to get the actual user's Gmail integration
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required for Gmail preview" },
        { status: 400 }
      )
    }

    // Use the configured maxResults value, with a fallback to 5 for preview
    const maxResults = config.maxResults || 5;
    const previewConfig = { ...config, maxResults };
    const input = {};

    // Import the search function dynamically to avoid import issues
    const { searchGmailEmails } = await import("../../../../../lib/workflows/actions/gmail/searchEmails")

    const result = await searchGmailEmails(previewConfig, userId, input);

    if (!result.success) {
      // Handle the case where user doesn't have Gmail integration
      if (result.message?.includes("Gmail integration not connected") || 
          result.message?.includes("not connected") ||
          result.message?.includes("JSON object requested, multiple (or no) rows returned") ||
          result.error?.includes("JSON object requested, multiple (or no) rows returned")) {
        return NextResponse.json({
          success: false,
          error: "No Gmail integration found. Please connect your Gmail account first.",
          data: {
            emails: [],
            count: 0
          }
        }, { status: 400 })
      }
      
      return NextResponse.json(
        { error: result.message || "Failed to search Gmail emails" },
        { status: 500 }
      )
    }

    // Return structured preview data
    return NextResponse.json({
      success: true,
      data: {
        emails: result.output?.emails || [],
        count: result.output?.count || 0,
        query: result.output?.query || "",
        message: result.message
      }
    })

  } catch (error: any) {
    console.error("Gmail search emails preview error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
} 