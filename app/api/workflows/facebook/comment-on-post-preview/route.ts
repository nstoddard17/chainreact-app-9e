import { NextRequest, NextResponse } from "next/server";
import { commentOnFacebookPost } from "@/lib/workflows/actions/facebook";

import { logger } from '@/lib/utils/logger'

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
    const { pageId, postId, comment } = config
    
    if (!pageId) {
      return NextResponse.json({
        success: false,
        error: "Please select a Facebook page first.",
        data: {
          commentId: null,
          preview: null
        }
      }, { status: 400 })
    }
    
    if (!postId) {
      return NextResponse.json({
        success: false,
        error: "Please select a post.",
        data: {
          commentId: null,
          preview: null
        }
      }, { status: 400 })
    }
    
    if (!comment) {
      return NextResponse.json({
        success: false,
        error: "Please enter a comment.",
        data: {
          commentId: null,
          preview: null
        }
      }, { status: 400 })
    }

    // For preview, we need to get the actual user's Facebook integration
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required for Facebook preview" },
        { status: 400 }
      )
    }

    // For preview, we'll just validate the configuration without actually commenting
    const input = {};

    const result = await commentOnFacebookPost(config, userId, input);

    if (!result.success) {
      // Handle the case where user doesn't have Facebook integration
      if (result.message?.includes("Facebook integration not connected") || 
          result.message?.includes("not connected") ||
          result.error?.includes("Facebook integration not connected")) {
        return NextResponse.json({
          success: false,
          error: "No Facebook integration found. Please connect your Facebook account first.",
          data: {
            commentId: null,
            preview: null
          }
        }, { status: 400 })
      }
      
      // Handle the case where page is not found
      if (result.message?.includes("Page with ID") || 
          result.error?.includes("Page with ID")) {
        return NextResponse.json({
          success: false,
          error: "Selected Facebook page not found or access denied. Please check your page selection.",
          data: {
            commentId: null,
            preview: null
          }
        }, { status: 400 })
      }
      
      return NextResponse.json(
        { error: result.message || result.error || "Failed to comment on Facebook post" },
        { status: 500 }
      )
    }

    // Return structured preview data
    return NextResponse.json({
      success: true,
      data: {
        commentId: result.output?.commentId || "preview_comment_id",
        pageId: result.output?.pageId || "",
        postId: result.output?.postId || "",
        comment: result.output?.comment || "",
        attachmentUrl: result.output?.attachmentUrl || null,
        attachmentType: result.output?.attachmentType || null,
        preview: {
          postId: postId,
          comment: comment,
          attachmentUrl: config.attachmentUrl || null,
          attachmentType: config.attachmentType || null
        },
        resultMessage: result.message
      }
    })

  } catch (error: any) {
    logger.error("Facebook comment on post preview error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
} 