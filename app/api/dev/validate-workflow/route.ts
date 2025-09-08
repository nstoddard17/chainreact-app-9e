import { NextRequest, NextResponse } from 'next/server'
import { buildWorkflowSchema } from '@/lib/ai/dynamicWorkflowAI'

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { workflow, prefersDiscord } = body || {}
    if (!workflow) return NextResponse.json({ error: 'workflow is required' }, { status: 400 })

    const schema = buildWorkflowSchema({ prefersDiscord: !!prefersDiscord })
    const result = schema.safeParse(workflow)
    if (result.success) {
      return NextResponse.json({ success: true })
    }
    const errors = result.error.issues.map(i => i.message)
    return NextResponse.json({ success: false, errors }, { status: 422 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}

