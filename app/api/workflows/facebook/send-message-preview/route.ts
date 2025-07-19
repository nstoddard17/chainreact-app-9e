import { NextRequest, NextResponse } from "next/server";
import { sendFacebookMessage } from "@/lib/workflows/actions/facebook";

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
    const { pageId, recipientId, message } = config
    
    if (!pageId) {
      return NextResponse.json({
        success: false,
        error: "Please select a Facebook page first.",
        data: {
          messageId: null,
          preview: null
        }
      }, { status: 400 })
    }
    
    if (!recipientId) {
      return NextResponse.json({
        success: false,
        error: "Please select a conversation.",
        data: {
          messageId: null,
          preview: null
        }
      }, { status: 400 })
    }
    
    if (!message) {
      return NextResponse.json({
        success: false,
        error: "Please enter a message.",
        data: {
          messageId: null,
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

    // For preview, we'll just validate the configuration without actually sending
    const input = {};

    const result = await sendFacebookMessage(config, userId, input);

    if (!result.success) {
      // Handle the case where user doesn't have Facebook integration
      if (result.message?.includes("Facebook integration not connected") || 
          result.message?.includes("not connected") ||
          result.error?.includes("Facebook integration not connected")) {
        return NextResponse.json({
          success: false,
          error: "No Facebook integration found. Please connect your Facebook account first.",
          data: {
            messageId: null,
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
            messageId: null,
            preview: null
          }
        }, { status: 400 })
      }
      
      return NextResponse.json(
        { error: result.message || result.error || "Failed to send Facebook message" },
        { status: 500 }
      )
    }

    // Extract sender info from conversation ID
    let senderId = recipientId
    let conversationId = recipientId
    if (recipientId.includes(':')) {
      const parts = recipientId.split(':')
      conversationId = parts[0]
      senderId = parts[1] || recipientId
    }

    // Return structured preview data
    return NextResponse.json({
      success: true,
      data: {
        messageId: result.output?.messageId || "preview_message_id",
        pageId: result.output?.pageId || "",
        recipientId: senderId,
        conversationId: conversationId,
        message: result.output?.message || "",
        quickReplies: result.output?.quickReplies || [],
        typingIndicator: result.output?.typingIndicator || true,
        preview: {
          recipient: senderId,
          conversationId: conversationId,
          message: message,
          quickReplies: config.quickReplies ? config.quickReplies.split('\n').filter((line: string) => line.trim()) : [],
          typingIndicator: config.typingIndicator !== false
        },
        resultMessage: result.message
      }
    })

  } catch (error: any) {
    console.error("Facebook send message preview error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
} 