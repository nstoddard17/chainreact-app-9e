import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkUsageLimit, trackUsage } from "@/lib/usageTracking"

import { logger } from '@/lib/utils/logger'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return errorResponse("AI not configured" , 500)
    }
    
    const { prompt, context, tone, field, integration, previous, regenerate } = await request.json()
    if (!prompt) {
      return errorResponse("Missing prompt" , 400)
    }
    
    // Get user session
    const supabaseAdmin = createAdminClient()
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader) {
      return errorResponse("Unauthorized" , 401)
    }

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }
    
    // Check AI usage limits
    const usageCheck = await checkUsageLimit(user.id, "ai_compose")
    if (!usageCheck.allowed) {
      return jsonResponse({ 
        error: `AI usage limit exceeded. You've used ${usageCheck.current}/${usageCheck.limit} AI compose uses this month. Please upgrade your plan for more AI usage.`
      }, { status: 429 })
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
      model: "gpt-4o-mini",
      messages,
      max_tokens: 512,
      temperature: 0.7,
    })
    const draft = completion.choices[0]?.message?.content?.trim() || ""
    
    // Track AI usage after successful response
    try {
      await trackUsage(user.id, "ai_compose", "compose_generation", 1, {
        integration,
        field,
        tone,
        prompt_length: prompt.length,
        draft_length: draft.length
      })
    } catch (trackingError) {
      logger.error("Failed to track AI usage:", trackingError)
      // Don't fail the request if tracking fails
    }
    
    return jsonResponse({ draft })
  } catch (error: any) {
    logger.error("AI Compose error:", error)
    return errorResponse(error.message || "Failed to generate draft" , 500)
  }
} 
