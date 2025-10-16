import { getIntegrationConfig } from "@/lib/integrations/availableIntegrations"
import type { TemplateSetupOverview } from "@/types/templateSetup"

const STATIC_LABEL_OVERRIDES: Record<string, string> = {
  airtable: "Airtable",
  google_sheets: "Google Sheets",
  gmail: "Gmail",
  custom: "Custom",
}

const normalizeKey = (value?: string | null) => {
  if (!value) return null
  return value.trim().toLowerCase()
}

export const formatIntegrationLabel = (value?: string | null): string | null => {
  const normalized = normalizeKey(value)
  if (!normalized) return null

  if (STATIC_LABEL_OVERRIDES[normalized]) {
    return STATIC_LABEL_OVERRIDES[normalized]
  }

  const config = getIntegrationConfig(normalized)
  if (config) {
    return config.name
  }

  return normalized
    .split(/[_-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

export interface RequirementLike {
  type: string
  title?: string
  integration?: string | null
}

export const getRequirementDisplay = (requirement: RequirementLike) => {
  const integrationLabel = formatIntegrationLabel(requirement.integration)
  const typeLabel = formatIntegrationLabel(requirement.type)

  const badge = integrationLabel || typeLabel || "Setup"

  let title = requirement.title
  if (!title) {
    if (integrationLabel) {
      title = `${integrationLabel} Setup`
    } else if (typeLabel) {
      title = `${typeLabel} Setup`
    } else {
      title = "Template Setup"
    }
  }

  return {
    title,
    badge,
  }
}

export const resolvePrimaryTargetLabel = (
  primaryTarget: string | null | undefined,
  requirements: Array<RequirementLike>
): string | null => {
  const fallback = formatIntegrationLabel(primaryTarget)
  if (fallback) return fallback

  for (const requirement of requirements) {
    const integrationLabel = formatIntegrationLabel(requirement.integration)
    if (integrationLabel) {
      return integrationLabel
    }
    const typeLabel = formatIntegrationLabel(requirement.type)
    if (typeLabel) {
      return typeLabel
    }
  }

  return null
}

export const normalizeOverviewNotes = (notes: TemplateSetupOverview["notes"]): string[] => {
  if (!notes) return []
  if (Array.isArray(notes)) {
    return notes.map((item) => item.trim()).filter(Boolean)
  }
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
