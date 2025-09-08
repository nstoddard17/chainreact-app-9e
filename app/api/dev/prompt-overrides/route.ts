import { NextRequest, NextResponse } from 'next/server'
import { loadPromptOverrides, savePromptOverrides } from '@/lib/ai/promptOverrides'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }
  const data = loadPromptOverrides()
  return NextResponse.json({ success: true, overrides: data })
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const ok = savePromptOverrides({ additionalSystem: body.additionalSystem || '' })
  if (!ok) return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ success: true })
}

