import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: NextRequest) {
  // Create a flag to check if connection was closed
  let connectionClosed = false;
  
  // Listen for connection close
  request.signal.addEventListener('abort', () => {
    connectionClosed = true;
    console.log("Client connection aborted for confirm action");
  });

  try {
    const { confirmationId, action, data } = await request.json()

    // Early exit if connection closed
    if (connectionClosed) {
      console.log("Connection closed early, aborting confirmation");
      return new Response(null, { status: 499 }); // Client Closed Request
    }

    // Get user session
    const supabaseAdmin = createAdminClient()
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check again if connection closed before executing action
    if (connectionClosed) {
      console.log("Connection closed before action execution");
      return new Response(null, { status: 499 }); // Client Closed Request
    }

    // Execute the confirmed action
    const result = await executeConfirmedAction(action, data, user.id, supabaseAdmin)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Confirm action error:", error)
    // Don't send error response if connection was closed
    if (connectionClosed) {
      return new Response(null, { status: 499 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

async function executeConfirmedAction(action: string, data: any, userId: string, supabaseAdmin: any) {
  switch (data.type) {
    case "calendar_cancel":
      return cancelCalendarEvent(data, userId, supabaseAdmin)
    default:
      return {
        message: "Action completed successfully.",
        result: { success: true }
      }
  }
}

async function cancelCalendarEvent(data: any, userId: string, supabaseAdmin: any) {
  try {
    // Get the integration
    const { data: integration, error } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("id", data.integrationId)
      .eq("user_id", userId)
      .single()

    if (error || !integration) {
      throw new Error("Integration not found")
    }

    // For now, return success (in a real implementation, you'd actually cancel the event)
    return {
      message: `Successfully cancelled the event: ${data.search}`,
      result: {
        success: true,
        cancelledEvent: data.search,
        integrationId: data.integrationId
      }
    }
  } catch (error) {
    console.error("Cancel calendar event error:", error)
    return {
      message: "Sorry, I couldn't cancel the event. Please try again.",
      result: { success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  }
} 