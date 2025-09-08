import fs from 'fs'
import path from 'path'

export interface PromptOverrides {
  additionalSystem?: string
}

const OVERRIDES_PATH = path.join(process.cwd(), 'db', 'ai-prompt-overrides.json')

export function loadPromptOverrides(): PromptOverrides {
  try {
    if (fs.existsSync(OVERRIDES_PATH)) {
      const raw = fs.readFileSync(OVERRIDES_PATH, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (e) {
    console.warn('Unable to load prompt overrides:', e)
  }
  return {}
}

export function savePromptOverrides(data: PromptOverrides) {
  try {
    const dir = path.dirname(OVERRIDES_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (e) {
    console.error('Failed to save prompt overrides:', e)
    return false
  }
}

