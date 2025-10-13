import { NextResponse } from "next/server"

export async function GET() {
  const metrics = {
    workflowsRun: 0,
    hoursSaved: 0,
    integrations: 0,
    aiCommands: 0,
  }

  return jsonResponse({ success: true, data: metrics })
}
