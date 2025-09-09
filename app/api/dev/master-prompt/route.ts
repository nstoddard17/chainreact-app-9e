import { NextResponse } from 'next/server'
import { getCurrentMasterSystemPrompt } from '@/lib/ai/dynamicWorkflowAI'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }
  const systemPrompt = getCurrentMasterSystemPrompt()
  return NextResponse.json({ success: true, systemPrompt })
}

