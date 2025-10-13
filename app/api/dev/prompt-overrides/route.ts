import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { loadPromptOverrides, savePromptOverrides } from '@/lib/ai/promptOverrides'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return errorResponse('Not available in production' , 403)
  }
  const data = loadPromptOverrides()
  return jsonResponse({ success: true, overrides: data })
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return errorResponse('Not available in production' , 403)
  }
  const body = await request.json().catch(() => ({}))
  const ok = savePromptOverrides({ additionalSystem: body.additionalSystem || '' })
  if (!ok) return jsonResponse({ success: false, error: 'Failed to save' }, { status: 500 })
  return jsonResponse({ success: true })
}

