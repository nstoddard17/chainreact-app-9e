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
    const { context, triggerData } = await request.json()
    
    // Get user from session
    const supabase = createAdminClient()
    const sessionCookie = request.cookies.get('sb-access-token')?.value ||
                         request.cookies.get('sb-refresh-token')?.value
    
    if (!sessionCookie) {
      return errorResponse("Unauthorized" , 401)
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(sessionCookie)
    
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }
    
    // Check AI usage limits
    const usageCheck = await checkUsageLimit(user.id, "ai_subject")
    if (!usageCheck.allowed) {
      return jsonResponse({ 
        error: `AI usage limit exceeded. You've used ${usageCheck.current}/${usageCheck.limit} AI subject generations this month. Please upgrade your plan for more AI usage.`
      }, { status: 429 })
    }
    
    // Build context for subject generation
    let contextInfo = ""
    if (triggerData?.message?.content) {
      contextInfo = `Original message: "${triggerData.message.content}"\n`
    }
    if (context) {
      contextInfo += `Additional context: ${JSON.stringify(context)}\n`
    }
    
    // Generate subject line
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant that generates professional email subject lines. 
          
Create concise, relevant subject lines that:
- Are 6-10 words maximum
- Clearly indicate the email's purpose
- Are professional but engaging
- Do not include "Re:" unless it's truly a reply
- Match the tone and context of the situation

Respond with ONLY the subject line, no additional text.`
        },
        {
          role: 'user',
          content: `Generate a professional email subject line for this context:\n\n${contextInfo}\n\nSubject line:`
        }
      ],
      max_tokens: 50,
      temperature: 0.7
    })

    const subject = completion.choices[0]?.message?.content?.trim() || "Re: Your Message"
    
    // Track usage
    await trackUsage(user.id, "ai_subject", "subject_generation", 1, {
      context_length: contextInfo.length
    })
    
    return jsonResponse({ 
      subject: subject
    })
    
  } catch (error: any) {
    logger.error("AI subject generation error:", error)
    return errorResponse("Failed to generate subject line" 
    , 500)
  }
}