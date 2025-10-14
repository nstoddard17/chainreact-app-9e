import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { registerTrelloWebhooksForUser } from '@/lib/integrations/trello/webhooks'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
    if (!userId) return errorResponse('Missing userId' , 400)
    await registerTrelloWebhooksForUser(userId)
    return jsonResponse({ success: true })
  } catch (e: any) {
    return errorResponse(e.message || 'Internal error' , 500)
  }
}


