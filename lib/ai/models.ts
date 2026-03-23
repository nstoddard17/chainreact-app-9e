/**
 * Centralized AI Model Configuration
 *
 * All model references in one place. When a new model version drops,
 * update here instead of find-and-replace across the codebase.
 */

export const AI_MODELS = {
  /** High-capability model for complex planning, node selection, configuration */
  planning: 'gpt-4o' as const,

  /** Fast/cheap model for prerequisites, simple tasks, error recovery */
  fast: 'gpt-4o-mini' as const,

  /** Model for node configuration generation */
  configuration: 'gpt-4o' as const,

  /** Model for workflow name generation, clarifying questions */
  utility: 'gpt-4o-mini' as const,

  /** Model for transcription */
  transcription: 'whisper-1' as const,
} as const

export type AIModelKey = keyof typeof AI_MODELS
export type AIModelId = (typeof AI_MODELS)[AIModelKey]

/**
 * Select model based on task type and user preference.
 * If user specifies a model override, that takes priority.
 */
export function selectModel(
  task: AIModelKey,
  userPreference?: string
): string {
  if (userPreference && userPreference !== 'auto') {
    return userPreference
  }
  return AI_MODELS[task]
}
