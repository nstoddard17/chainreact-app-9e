import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { cleanTranscription } from '@/lib/utils/text-cleanup'
import OpenAI from 'openai'

/**
 * POST /api/ai/transcribe
 * Transcribes audio using OpenAI Whisper API
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    // Get OpenAI API key from environment
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      logger.error('OPENAI_API_KEY not configured')
      return errorResponse('Transcription not configured', 500)
    }

    // Get audio file from request
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return errorResponse('No audio file provided', 400)
    }

    logger.info('Transcription request', {
      userId: user.id,
      audioSize: audioFile.size,
      audioType: audioFile.type
    })

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    })

    // Transcribe using Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en', // Optimize for English
      response_format: 'json',
      temperature: 0, // Lower temperature for faster, more deterministic output
      prompt: 'ChainReact workflow automation platform. Integration, workflow, trigger, action, node, automation, email, calendar, Slack, Discord, Notion, Airtable, database, API.' // Context helps improve accuracy and speed
    })

    // Clean up the transcription (remove filler words, fix common errors)
    const cleanedText = cleanTranscription(transcription.text)

    logger.info('Transcription completed', {
      userId: user.id,
      originalLength: transcription.text.length,
      cleanedLength: cleanedText.length,
      fillerWordsRemoved: transcription.text.length - cleanedText.length
    })

    return jsonResponse({
      text: cleanedText,
      original: transcription.text, // Include original for debugging if needed
    })
  } catch (error: any) {
    logger.error('Error transcribing audio:', error)
    return errorResponse('Failed to transcribe audio', 500)
  }
}
