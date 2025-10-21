/**
 * Text cleanup utilities for voice transcription
 * Removes filler words and improves transcription quality
 */

// ONLY remove actual filler SOUNDS (not words with meaning)
// These are vocal pauses that add no information
const FILLER_WORDS = [
  'um', 'uh', 'uhm', 'umm', 'hmm', 'hm', 'er', 'ah', 'uh-huh', 'mm-hmm'
]

// Don't use filler phrases or sentence start fillers
// Those words might have actual meaning
const FILLER_PHRASES: string[] = []
const SENTENCE_START_FILLERS: string[] = []

/**
 * Remove filler words from transcribed text
 * Preserves natural sentence structure and capitalization
 */
export function removeFillerWords(text: string): string {
  if (!text || text.trim().length === 0) {
    return text
  }

  let cleaned = text

  // First, remove filler phrases (multi-word)
  for (const phrase of FILLER_PHRASES) {
    // Case-insensitive replacement
    const regex = new RegExp(`\\b${phrase}\\b,?\\s*`, 'gi')
    cleaned = cleaned.replace(regex, ' ')
  }

  // Then remove single filler words (anywhere in text)
  for (const word of FILLER_WORDS) {
    // Match word boundaries to avoid removing parts of words
    // Also handle optional comma after filler word
    const regex = new RegExp(`\\b${word}\\b,?\\s*`, 'gi')
    cleaned = cleaned.replace(regex, ' ')
  }

  // Remove sentence-start fillers ONLY at the beginning
  for (const word of SENTENCE_START_FILLERS) {
    // Only match at start of string (after trimming)
    const regex = new RegExp(`^${word}\\b,?\\s*`, 'i')
    cleaned = cleaned.trim().replace(regex, '')
  }

  // Clean up extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // Ensure first letter is capitalized
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }

  // Ensure sentence ends with punctuation if it doesn't already
  if (cleaned.length > 0 && !cleaned.match(/[.!?]$/)) {
    // Don't add period if it looks like a fragment or question
    const lastWord = cleaned.split(' ').pop()?.toLowerCase()
    const questionWords = ['what', 'when', 'where', 'who', 'why', 'how', 'which', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does']

    if (cleaned.includes('?') || questionWords.includes(lastWord || '')) {
      // Likely a question
      if (!cleaned.endsWith('?')) {
        cleaned += '?'
      }
    }
  }

  return cleaned
}

/**
 * Clean up common transcription errors
 * e.g., "tape" -> "type" when context suggests typing
 */
export function fixCommonTranscriptionErrors(text: string): string {
  if (!text || text.trim().length === 0) {
    return text
  }

  let fixed = text

  // Common misheard words in context
  const corrections: Record<string, RegExp> = {
    'type': /\btape\s+(out|in|it|something|text)\b/gi,
    'create': /\bgreat\s+(a|an|the)\s+(workflow|integration)\b/gi,
    'write': /\bright\s+(a|an|the|some|this)\b/gi,
    'send': /\bsent\s+(a|an|the|me|it)\b/gi,
    'show': /\bshoe\s+(me|the|my)\b/gi,
  }

  for (const [correct, pattern] of Object.entries(corrections)) {
    fixed = fixed.replace(pattern, (match) => {
      // Preserve the rest of the phrase, just replace the first word
      return match.replace(/^\w+/, correct)
    })
  }

  return fixed
}

/**
 * Complete text cleanup pipeline for voice transcription
 * Combines filler word removal and error correction
 */
export function cleanTranscription(text: string): string {
  if (!text || text.trim().length === 0) {
    return text
  }

  // Step 1: Remove filler words
  let cleaned = removeFillerWords(text)

  // Step 2: Fix common transcription errors
  cleaned = fixCommonTranscriptionErrors(cleaned)

  // Step 3: Final cleanup
  cleaned = cleaned.trim()

  return cleaned
}
