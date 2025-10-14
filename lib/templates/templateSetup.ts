import { getTemplateById } from '@/lib/templates/predefinedTemplates'
import type {
  AirtableIntegrationSetup,
  TemplateIntegrationSetup,
} from '@/types/templateSetup'

function isAirtableSetup(value: any): value is AirtableIntegrationSetup {
  return Boolean(value && typeof value === 'object' && value.baseName && Array.isArray(value.tables))
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function convertAirtableSetup(source: any, instructions?: string[]): AirtableIntegrationSetup | null {
  if (!source || typeof source !== 'object') return null
  if (!source.baseName || !Array.isArray(source.tables)) return null
  return {
    type: 'airtable',
    baseName: source.baseName,
    tables: source.tables,
    instructions,
  }
}

export function extractIntegrationSetups(rawTemplate: any): TemplateIntegrationSetup[] {
  if (!rawTemplate) return []

  const setups: TemplateIntegrationSetup[] = []
  const seen = new Set<string>()
  const addSetup = (setup: TemplateIntegrationSetup | null | undefined) => {
    if (!setup) return
    const key = `${setup.type}:${(setup as any).title || ""}:${(setup as any).baseName || ""}`
    if (seen.has(key)) return
    seen.add(key)
    setups.push(setup)
  }

  if (Array.isArray(rawTemplate.integrationSetups)) {
    rawTemplate.integrationSetups.forEach((setup: TemplateIntegrationSetup) => addSetup(setup))
  }

  const publishedSetup = rawTemplate.integration_setup
  if (typeof publishedSetup === "string") {
    try {
      const parsed = JSON.parse(publishedSetup)
      toArray(parsed).forEach((setup: TemplateIntegrationSetup) => addSetup(setup))
    } catch (error) {
      console.error("[TemplateSetup] Failed to parse integration_setup JSON:", error)
    }
  } else if (publishedSetup) {
    toArray(publishedSetup).forEach((setup: TemplateIntegrationSetup) => addSetup(setup))
  }

  const draftSetup = rawTemplate.draft_integration_setup
  if (typeof draftSetup === "string") {
    try {
      const parsed = JSON.parse(draftSetup)
      toArray(parsed).forEach((setup: TemplateIntegrationSetup) => addSetup(setup))
    } catch (error) {
      console.error("[TemplateSetup] Failed to parse draft_integration_setup JSON:", error)
    }
  } else if (draftSetup) {
    toArray(draftSetup).forEach((setup: TemplateIntegrationSetup) => addSetup(setup))
  }

  const hasAirtable = setups.some((setup) => setup.type === "airtable")
  if (!hasAirtable) {
    if (isAirtableSetup(rawTemplate.airtableSetup)) {
      addSetup(convertAirtableSetup(rawTemplate.airtableSetup))
    } else if (rawTemplate.airtable_setup) {
      const airtableValue =
        typeof rawTemplate.airtable_setup === "string"
          ? (() => {
              try {
                return JSON.parse(rawTemplate.airtable_setup)
              } catch (error) {
                console.error("[TemplateSetup] Failed to parse airtable_setup JSON:", error)
                return null
              }
            })()
          : rawTemplate.airtable_setup

      addSetup(convertAirtableSetup(airtableValue))
    }
  }

  return setups
}

export function resolvePredefinedTemplate(templateId: string) {
  return getTemplateById(templateId)
}
