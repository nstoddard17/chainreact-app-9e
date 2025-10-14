import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { generateDynamicWorkflow } from '@/lib/ai/dynamicWorkflowAI'

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return errorResponse('Not available in production' , 403)
  }
  try {
    const { prompt, model, variantBSystemPrefix, variantBUserSuffix } = await request.json()
    if (!prompt) return errorResponse('Prompt is required' , 400)

    const base = await generateDynamicWorkflow({ prompt, userId: 'dev-ab', model: model || 'gpt-4o-mini', debug: true })
    const varB = await generateDynamicWorkflow({
      prompt,
      userId: 'dev-ab',
      model: model || 'gpt-4o-mini',
      debug: true,
      extraSystemPrefix: `${variantBSystemPrefix || '' }\n`,
      extraUserSuffix: variantBUserSuffix || ''
    })

    return jsonResponse({
      success: true,
      variantA: base,
      variantB: varB,
    })
  } catch (e: any) {
    return errorResponse(e?.message || 'Internal error' , 500)
  }
}

