import { NextRequest, NextResponse } from "next/server"
import { generateDynamicWorkflow } from "@/lib/ai/dynamicWorkflowAI"

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  try {
    const { prompt, model } = await request.json()
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const validModels: Array<'gpt-4o' | 'gpt-4o-mini'> = ['gpt-4o', 'gpt-4o-mini']
    const selectedModel = validModels.includes(model) ? model : 'gpt-4o-mini'

    const result = await generateDynamicWorkflow({
      prompt,
      userId: 'dev-debug',
      model: selectedModel,
      debug: true,
    })

    return NextResponse.json({
      success: true,
      generated: result.workflow,
      debug: result.debug,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 })
  }
}

