import { NextRequest, NextResponse } from 'next/server'
import { generateDynamicWorkflow } from '@/lib/ai/dynamicWorkflowAI'

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }
  try {
    const { prompt, model, variantBSystemPrefix, variantBUserSuffix } = await request.json()
    if (!prompt) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })

    const base = await generateDynamicWorkflow({ prompt, userId: 'dev-ab', model: model || 'gpt-4o-mini', debug: true })
    const varB = await generateDynamicWorkflow({
      prompt,
      userId: 'dev-ab',
      model: model || 'gpt-4o-mini',
      debug: true,
      extraSystemPrefix: `${variantBSystemPrefix || '' }\n`,
      extraUserSuffix: variantBUserSuffix || ''
    })

    return NextResponse.json({
      success: true,
      variantA: base,
      variantB: varB,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}

