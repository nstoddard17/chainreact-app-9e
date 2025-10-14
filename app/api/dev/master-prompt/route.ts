import { NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { getCurrentMasterSystemPrompt } from '@/lib/ai/dynamicWorkflowAI'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return errorResponse('Not available in production' , 403)
  }
  const systemPrompt = getCurrentMasterSystemPrompt()
  return jsonResponse({ success: true, systemPrompt })
}

