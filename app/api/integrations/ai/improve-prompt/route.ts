import { NextResponse } from "next/server"
import OpenAI from "openai"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

interface ImprovePromptBody {
  prompt?: string
  systemPrompt?: string
  quickAction?: string
  model?: string
}

export async function POST(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: ImprovePromptBody
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
  }

  const quickAction = body.quickAction || "custom"
  const systemPrompt = `You are an expert workflow-automation prompt engineer. Improve the user's prompt so it is concise, unambiguous, and production-ready. Preserve the original intent. The selected quick action is ${quickAction}.`

  const userPrompt = [`Original prompt:`, prompt]
  if (body.systemPrompt) {
    userPrompt.push(`\nSystem prompt:\n${body.systemPrompt}`)
  }

  const openai = new OpenAI({ apiKey })

  try {
    const completion = await openai.chat.completions.create({
      model: body.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt.join("\n\n") }
      ],
      temperature: 0.3,
    })

    const improvedPrompt = completion.choices?.[0]?.message?.content?.trim()

    return NextResponse.json({ improvedPrompt: improvedPrompt || prompt })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Improve Prompt] Failed to refine prompt", error)
    return NextResponse.json({ error: "Failed to improve prompt" }, { status: 500 })
  }
}
