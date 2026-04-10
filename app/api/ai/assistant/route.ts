import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { AIAssistantService } from "@/lib/services/ai/aiAssistantService"
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { logger } from '@/lib/utils/logger'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

// Simple test endpoint
export async function GET() {
  const aiAssistantService = new AIAssistantService()
  const status = await aiAssistantService.getStatus()
  return jsonResponse(status)
}

export async function POST(request: NextRequest) {
  // Rate limiting: 30 AI assistant requests per minute per IP
  const rateLimitResult = await checkRateLimit(request, {
    limit: 30,
    windowSeconds: 60
  })
  if (!rateLimitResult.success && rateLimitResult.response) {
    return rateLimitResult.response
  }

  // Create a flag to check if connection was closed
  let connectionClosed = false
  
  // Listen for connection close
  request.signal.addEventListener('abort', () => {
    connectionClosed = true
    logger.info("Client connection aborted")
  })

  try {
    // Early exit if connection closed
    if (connectionClosed) {
      logger.info("Connection closed early, aborting processing")
      return new Response(null, { status: 499 }) // Client Closed Request
    }

    // Auth check for entitlement (service also checks auth internally)
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    // Check feature entitlement (Pro plan or higher)
    const { requireFeature } = await import('@/lib/utils/require-entitlement')
    const entitlement = await requireFeature(user.id, 'aiAgents')
    if (!entitlement.allowed) return entitlement.response

    const aiAssistantService = new AIAssistantService()
    const result = await aiAssistantService.processMessage(request)

    if (result.error) {
      let statusCode = 500
      
      if (result.error === "Unauthorized") {
        statusCode = 401
      } else if (result.error === "AI usage limit exceeded") {
        statusCode = 429
      } else if (result.error === "Invalid message format") {
        statusCode = 400
      }

      return jsonResponse({
        error: result.error,
        content: result.content
      }, { status: statusCode })
    }

    return jsonResponse({
      content: result.content,
      metadata: result.metadata
    })

  } catch (error: any) {
    logger.error("❌ AI Assistant route error:", error)

    return errorResponse("Internal server error", 500, {
      content: "I encountered an unexpected error. Please try again."
    })
  }
}