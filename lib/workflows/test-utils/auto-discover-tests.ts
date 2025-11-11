/**
 * Auto-Discover Integration Tests
 *
 * Automatically generates test configurations for all actions and triggers
 * by analyzing the node definitions in availableNodes.ts
 */

import { ALL_NODE_COMPONENTS, type NodeComponent } from '../availableNodes'

export interface AutoTestConfig {
  provider: string
  displayName: string
  actions: ActionAutoTest[]
  triggers: TriggerAutoTest[]
}

export interface ActionAutoTest {
  nodeType: string
  actionName: string
  configFields: string[]
  providerId?: string
}

export interface TriggerAutoTest {
  nodeType: string
  triggerName: string
  configFields: string[]
  providerId?: string
}

/**
 * Auto-discover all testable integrations from node definitions
 */
export function autoDiscoverTests(): AutoTestConfig[] {
  // Group nodes by provider
  const providerMap = new Map<string, NodeComponent[]>()

  for (const node of ALL_NODE_COMPONENTS) {
    // Skip non-integration nodes (logic, AI, automation, utility, misc)
    if (!node.providerId || isUtilityProvider(node.providerId)) {
      continue
    }

    const provider = node.providerId
    if (!providerMap.has(provider)) {
      providerMap.set(provider, [])
    }
    providerMap.get(provider)!.push(node)
  }

  // Generate test configs for each provider
  const configs: AutoTestConfig[] = []

  for (const [provider, nodes] of providerMap.entries()) {
    const actions: ActionAutoTest[] = []
    const triggers: TriggerAutoTest[] = []

    for (const node of nodes) {
      if (node.isTrigger) {
        triggers.push({
          nodeType: node.type,
          triggerName: node.name,
          configFields: extractConfigFields(node),
          providerId: node.providerId,
        })
      } else {
        actions.push({
          nodeType: node.type,
          actionName: node.name,
          configFields: extractConfigFields(node),
          providerId: node.providerId,
        })
      }
    }

    configs.push({
      provider,
      displayName: formatProviderName(provider),
      actions,
      triggers,
    })
  }

  // Sort by display name
  return configs.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/**
 * Extract config field names from a node
 */
function extractConfigFields(node: NodeComponent): string[] {
  if (!node.configSchema) return []

  return node.configSchema
    .filter(field => field.required)
    .map(field => field.name)
}

/**
 * Check if provider is a utility provider (not a real integration)
 */
function isUtilityProvider(providerId: string): boolean {
  const utilityProviders = [
    'logic',
    'ai',
    'automation',
    'utility',
    'misc',
    'generic',
  ]

  return utilityProviders.some(util => providerId.startsWith(util))
}

/**
 * Format provider ID to display name
 */
function formatProviderName(provider: string): string {
  // Handle special cases
  const specialCases: Record<string, string> = {
    'gmail': 'Gmail',
    'google-sheets': 'Google Sheets',
    'google-calendar': 'Google Calendar',
    'google-drive': 'Google Drive',
    'google-docs': 'Google Docs',
    'google-analytics': 'Google Analytics',
    'microsoft-outlook': 'Microsoft Outlook',
    'microsoft-teams': 'Microsoft Teams',
    'microsoft-onenote': 'Microsoft OneNote',
    'microsoft-excel': 'Microsoft Excel',
    'onedrive': 'OneDrive',
    'hubspot': 'HubSpot',
    'mailchimp': 'Mailchimp',
    'youtube': 'YouTube',
    'youtube-studio': 'YouTube Studio',
  }

  if (specialCases[provider]) {
    return specialCases[provider]
  }

  // Default: capitalize first letter of each word
  return provider
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Get test config for a specific provider
 */
export function getProviderTestConfig(provider: string): AutoTestConfig | undefined {
  const allConfigs = autoDiscoverTests()
  return allConfigs.find(c => c.provider === provider)
}

/**
 * Get all providers that have tests
 */
export function getTestedProviders(): string[] {
  return autoDiscoverTests().map(c => c.provider)
}

/**
 * Get statistics about testable nodes
 */
export function getTestStatistics() {
  const configs = autoDiscoverTests()

  return {
    totalProviders: configs.length,
    totalActions: configs.reduce((sum, c) => sum + c.actions.length, 0),
    totalTriggers: configs.reduce((sum, c) => sum + c.triggers.length, 0),
    providerBreakdown: configs.map(c => ({
      provider: c.displayName,
      actions: c.actions.length,
      triggers: c.triggers.length,
      total: c.actions.length + c.triggers.length,
    })),
  }
}
