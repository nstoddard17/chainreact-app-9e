import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

export async function GET() {
  const metrics = {
    workflowsRun: 0,
    hoursSaved: 0,
    integrations: 0,
    aiCommands: 0,
  }

  return jsonResponse({ success: true, data: metrics })
}
