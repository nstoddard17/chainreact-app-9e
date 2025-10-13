import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { generateDynamicWorkflow } from "@/lib/ai/dynamicWorkflowAI"

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return errorResponse('Not available in production' , 403)
  }

  try {
    const { prompt, model } = await request.json()
    if (!prompt) {
      return errorResponse("Prompt is required" , 400)
    }

    const validModels: Array<'gpt-4o' | 'gpt-4o-mini'> = ['gpt-4o', 'gpt-4o-mini']
    const selectedModel = validModels.includes(model) ? model : 'gpt-4o-mini'

    const result = await generateDynamicWorkflow({
      prompt,
      userId: 'dev-debug',
      model: selectedModel,
      debug: true,
    })

    return jsonResponse({
      success: true,
      generated: result.workflow,
      debug: result.debug,
    })
  } catch (error: any) {
    return errorResponse(error?.message || 'Internal error' , 500)
  }
}

