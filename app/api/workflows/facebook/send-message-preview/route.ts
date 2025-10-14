import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { sendFacebookMessage } from "@/lib/workflows/actions/facebook";

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const { config, userId } = await request.json();

    if (!config) {
      return errorResponse("Config is required" , 400)
    }

    // Validate required fields
    const { pageId, recipientId, message } = config
    
    if (!pageId) {
      return jsonResponse({
        success: false,
        error: "Please select a Facebook page first.",
        data: {
          messageId: null,
          preview: null
        }
      }, { status: 400 })
    }
    
    if (!recipientId) {
      return jsonResponse({
        success: false,
        error: "Please select a conversation.",
        data: {
          messageId: null,
          preview: null
        }
      }, { status: 400 })
    }
    
    if (!message) {
      return jsonResponse({
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
      return errorResponse("User ID is required for Facebook preview" , 400)
    }

    // For preview, we'll just validate the configuration without actually sending
    const input = {};

    const result = await sendFacebookMessage(config, userId, input);

    if (!result.success) {
      // Handle the case where user doesn't have Facebook integration
      if (result.message?.includes("Facebook integration not connected") || 
          result.message?.includes("not connected") ||
          result.error?.includes("Facebook integration not connected")) {
        return jsonResponse({
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
        return jsonResponse({
          success: false,
          error: "Selected Facebook page not found or access denied. Please check your page selection.",
          data: {
            messageId: null,
            preview: null
          }
        }, { status: 400 })
      }
      
      return errorResponse(result.message || result.error || "Failed to send Facebook message" , 500)
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
    return jsonResponse({
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
    logger.error("Facebook send message preview error:", error)
    return errorResponse(error.message || "Internal server error" , 500)
  }
} 