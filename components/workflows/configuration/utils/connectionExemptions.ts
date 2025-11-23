/**
 * Shared helper for determining which providers/node types do NOT require OAuth connections.
 * Keep this list in sync anywhere connection UI/state needs to be skipped.
 */

const CONNECTION_EXEMPT_PROVIDERS = new Set<string>([
  // Logic / control providers
  'logic',
  'mapper',
  'core',
  'manual',

  // Scheduling / branching helpers
  'schedule',
  'conditional',
  'if_then',
  'path',
  'filter',
  'http_request',

  // Utility + system helpers
  'utility',
  'transformer',
  'file_upload',
  'extract_website_data',
  'conditional_trigger',
  'google_search',
  'tavily_search',

  // First-party AI + automation helpers
  'ai',
  'ai_agent',
  'ai_router',
  'ai_message',
  'ai_action',

  // System nodes that never prompt for OAuth
  'webhook',
])

const CONNECTION_EXEMPT_NODE_TYPES = new Set<string>([
  'webhook',
  'format_transformer',
  'parse_file',
  'extract_website_data',
  'conditional_trigger',
  'google_search',
  'tavily_search',
  'hitl_conversation',
  'ai_agent',
  'ai_router',
  'ai_message',
  'ai_action',
])

export const isProviderConnectionExempt = (providerId?: string | null): boolean => {
  if (!providerId) return false
  return CONNECTION_EXEMPT_PROVIDERS.has(providerId)
}

export const isNodeTypeConnectionExempt = (nodeType?: string | null): boolean => {
  if (!nodeType) return false
  return CONNECTION_EXEMPT_NODE_TYPES.has(nodeType)
}

export { CONNECTION_EXEMPT_PROVIDERS, CONNECTION_EXEMPT_NODE_TYPES }
