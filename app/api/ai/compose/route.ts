import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "AI not configured" }, { status: 500 })
    }
    const { prompt, context, tone, field, integration, previous, regenerate } = await request.json()
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 })
    }
    // Build system/context message
    let systemPrompt = `You are an expert assistant for ${integration}. Your job is to help users write high-quality ${field} content.`
    if (tone && tone !== "none") {
      systemPrompt += ` Write in a ${tone} tone.`
    }
    if (context && typeof context === "object") {
      const contextStr = Object.entries(context)
        .filter(([k, v]) => v && typeof v === "string" && v.length < 200)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")
      if (contextStr) {
        systemPrompt += `\nContext:\n${contextStr}`
      }
    }
    // Compose messages
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ]
    if (previous && typeof previous === "string" && previous.length > 0 && !regenerate) {
      messages.push({ role: "user", content: `Here is my previous draft: ${previous}` })
    }
    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      max_tokens: 512,
      temperature: 0.7,
    })
    const draft = completion.choices[0]?.message?.content?.trim() || ""
    return NextResponse.json({ draft })
  } catch (error: any) {
    console.error("AI Compose error:", error)
    return NextResponse.json({ error: error.message || "Failed to generate draft" }, { status: 500 })
  }
} 