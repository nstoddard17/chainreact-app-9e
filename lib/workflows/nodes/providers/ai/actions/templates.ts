export interface AIActionTemplate {
  id: string
  name: string
  description: string
  defaults: Record<string, any>
}

type TemplateRegistry = Record<string, AIActionTemplate[]>

/**
 * Preset configurations for AI data-processing actions.
 * These values are applied as starting points when a template is selected in the builder UI.
 */
export const AI_ACTION_TEMPLATES: TemplateRegistry = {
  ai_action_summarize: [
    {
      id: "support_ticket_summary",
      name: "Support Ticket Summary",
      description: "Create a short digest highlighting the issue, customer sentiment, and next steps.",
      defaults: {
        maxLength: 220,
        style: "brief bullet points",
        focus: "customer sentiment, issue details, suggested next step"
      }
    },
    {
      id: "executive_brief",
      name: "Executive Brief",
      description: "Condense long-form content into an executive-ready summary.",
      defaults: {
        maxLength: 180,
        style: "executive summary",
        focus: "strategic impact, metrics, blockers"
      }
    },
    {
      id: "meeting_notes",
      name: "Meeting Notes Recap",
      description: "Turn notes or transcripts into concise follow-up bullets.",
      defaults: {
        maxLength: 250,
        style: "bullet_points",
        focus: "decisions, owners, deadlines"
      }
    }
  ],
  ai_action_extract: [
    {
      id: "contact_details",
      name: "Contact Details",
      description: "Capture emails, phone numbers, and names from the text.",
      defaults: {
        extractionType: "custom",
        instructions:
          "Extract contact details as JSON with keys: name, email, phone, company. Return null when a field is missing.",
        returnFormat: "json"
      }
    },
    {
      id: "follow_up_items",
      name: "Follow-up Checklist",
      description: "Identify tasks and owners that require follow-up.",
      defaults: {
        extractionType: "custom",
        instructions:
          "List all follow-up tasks as JSON array with fields: task, owner, due_date (optional), priority (high|medium|low).",
        returnFormat: "json"
      }
    },
    {
      id: "key_entities",
      name: "Key Entities",
      description: "Pull out people, organisations, products, and dates.",
      defaults: {
        extractionType: "entities",
        returnFormat: "array"
      }
    }
  ],
  ai_action_sentiment: [
    {
      id: "basic_sentiment",
      name: "Basic Sentiment",
      description: "Classify overall tone as positive, neutral, or negative.",
      defaults: {
        analysisType: "basic",
        labels: "positive\nneutral\nnegative",
        confidence: true
      }
    },
    {
      id: "customer_health",
      name: "Customer Health",
      description: "Score urgency and emotion for customer feedback.",
      defaults: {
        analysisType: "detailed",
        labels: "delighted\nsatisfied\nconcerned\nat_risk",
        confidence: true
      }
    },
    {
      id: "emotion_breakdown",
      name: "Emotion Breakdown",
      description: "Identify the dominant emotions in the message.",
      defaults: {
        analysisType: "emotions",
        labels: "joy\ntrust\nanger\nsadness\nfear",
        confidence: true
      }
    }
  ],
  ai_action_translate: [
    {
      id: "to_english_support",
      name: "Localise to English",
      description: "Translate incoming feedback to English while keeping formatting.",
      defaults: {
        targetLanguage: "en",
        sourceLanguage: "auto",
        preserveFormatting: true
      }
    },
    {
      id: "to_spanish_support",
      name: "Reply in Spanish",
      description: "Provide a Spanish version of the supplied content.",
      defaults: {
        targetLanguage: "es",
        sourceLanguage: "auto",
        preserveFormatting: true
      }
    },
    {
      id: "formal_french",
      name: "Formal French",
      description: "Translate to formal business French without losing tone.",
      defaults: {
        targetLanguage: "fr",
        sourceLanguage: "auto",
        preserveFormatting: true
      }
    }
  ],
  ai_action_generate: [
    {
      id: "support_reply",
      name: "Customer Support Reply",
      description: "Draft a helpful response acknowledging the customer and outlining next steps.",
      defaults: {
        contentType: "response",
        tone: "friendly",
        length: "medium",
        temperature: 0.6,
        prompt:
          "Using the context provided, write a friendly customer support reply. Acknowledge the person's situation, explain any relevant findings, and outline clear next steps or timelines."
      }
    },
    {
      id: "status_update",
      name: "Project Status Update",
      description: "Summarise progress, blockers, and next steps for stakeholders.",
      defaults: {
        contentType: "report",
        tone: "professional",
        length: "medium",
        temperature: 0.4,
        prompt:
          "Generate a concise project status update. Include progress made, key metrics, blockers or risks, and the upcoming plan."
      }
    },
    {
      id: "marketing_snippet",
      name: "Marketing Snippet",
      description: "Create a short promotional blurb in a casual tone.",
      defaults: {
        contentType: "custom",
        tone: "casual",
        length: "short",
        temperature: 0.75,
        prompt:
          "Write a short, upbeat promotional snippet highlighting the key benefits found in the context. Keep it under 80 words and end with a clear call to action."
      }
    }
  ],
  ai_action_classify: [
    {
      id: "support_triage",
      name: "Support Triage",
      description: "Bucket feedback into support categories with confidence.",
      defaults: {
        categories: "bug_report\nfeature_request\nhow_to_question\nbilling\nchatter",
        confidence: true
      }
    },
    {
      id: "lead_scoring",
      name: "Lead Scoring",
      description: "Score inbound leads by intent level.",
      defaults: {
        categories: "hot\nwarm\ncold\nnot_a_lead",
        confidence: true
      }
    },
    {
      id: "priority_label",
      name: "Priority Labels",
      description: "Classify conversations as high, medium, or low priority.",
      defaults: {
        categories: "high_priority\nmedium_priority\nlow_priority",
        confidence: true
      }
    }
  ]
}

export function getTemplateOptionsForAction(actionType: string) {
  const templates = AI_ACTION_TEMPLATES[actionType] || []
  return templates.map((template) => ({
    value: template.id,
    label: template.name,
    description: template.description
  }))
}

export function getTemplateDefaults(actionType: string, templateId?: string) {
  if (!templateId) return null
  const templates = AI_ACTION_TEMPLATES[actionType] || []
  return templates.find((template) => template.id === templateId)?.defaults ?? null
}

export function applyTemplateDefaultsToConfig(actionType: string, config: Record<string, any>) {
  if (!config) return config
  const templateId = config.template
  if (!templateId || templateId === "custom") {
    return config
  }

  const defaults = getTemplateDefaults(actionType, templateId)
  if (!defaults) {
    return config
  }

  Object.entries(defaults).forEach(([key, value]) => {
    const current = config[key]
    const isBlankString = typeof current === "string" && current.trim() === ""
    if (current === undefined || current === null || isBlankString) {
      config[key] = value
    }
  })

  return config
}
