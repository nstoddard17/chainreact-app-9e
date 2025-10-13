import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { buildWorkflowSchema } from '@/lib/ai/dynamicWorkflowAI'

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return errorResponse('Not available in production' , 403)
  }

  try {
    const body = await request.json()
    const { workflow, prefersDiscord } = body || {}
    if (!workflow) return errorResponse('workflow is required' , 400)

    const schema = buildWorkflowSchema({ prefersDiscord: !!prefersDiscord })
    const result = schema.safeParse(workflow)
    if (result.success) {
      return jsonResponse({ success: true })
    }
    const errors = result.error.issues.map(i => i.message)
    return jsonResponse({ success: false, errors }, { status: 422 })
  } catch (e: any) {
    return errorResponse(e?.message || 'Internal error' , 500)
  }
}

