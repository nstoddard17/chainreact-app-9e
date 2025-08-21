import { NextRequest, NextResponse } from "next/server"
import { AIAssistantService } from "@/lib/services/ai/aiAssistantService"

// Simple test endpoint
export async function GET() {
  const aiAssistantService = new AIAssistantService()
  const status = await aiAssistantService.getStatus()
  return NextResponse.json(status)
}

export async function POST(request: NextRequest) {
  // Create a flag to check if connection was closed
  let connectionClosed = false
  
  // Listen for connection close
  request.signal.addEventListener('abort', () => {
    connectionClosed = true
    console.log("Client connection aborted")
  })

  try {
    // Early exit if connection closed
    if (connectionClosed) {
      console.log("Connection closed early, aborting processing")
      return new Response(null, { status: 499 }) // Client Closed Request
    }

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

      return NextResponse.json({
        error: result.error,
        content: result.content
      }, { status: statusCode })
    }

    return NextResponse.json({
      content: result.content,
      metadata: result.metadata
    })

  } catch (error: any) {
    console.error("❌ AI Assistant route error:", error)
    
    return NextResponse.json({
      error: "Internal server error",
      content: "I encountered an unexpected error. Please try again."
    }, { status: 500 })
  }
}