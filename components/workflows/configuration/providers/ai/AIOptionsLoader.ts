import { ProviderOptionsLoader, LoadOptionsParams } from '../types'

export class AIOptionsLoader implements ProviderOptionsLoader {
  providerId = 'ai'

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'ai' && ['inputNodeId', 'memoryIntegration', 'customMemoryIntegrations', 'contextNodeIds'].includes(fieldName)
  }

  async loadOptions(params: LoadOptionsParams): Promise<any[]> {
    const { fieldName, extraOptions } = params
    const resourceType = this.getResourceType(fieldName)

    if (!resourceType) return []

    try {
      // Build query parameters
      const queryParams = new URLSearchParams({
        type: resourceType,
        ...(extraOptions?.workflowId && { workflowId: extraOptions.workflowId })
      })

      const response = await fetch(`/api/integrations/ai/data?${queryParams}`)

      if (!response.ok) {
        console.error(`Failed to fetch AI options for ${resourceType}`)
        return []
      }

      const data = await response.json()
      return Array.isArray(data) ? data : []
    } catch (error) {
      console.error(`Error loading AI options for ${fieldName}:`, error)
      return []
    }
  }

  getFieldDependencies(fieldName: string): string[] {
    // AI Agent fields don't have dependencies within the node
    // The inputNodeId depends on the workflow context, not other fields
    return []
  }

  shouldReloadOnChange(fieldName: string, changedField: string): boolean {
    // No field dependencies that require reloading
    return false
  }

  private getResourceType(fieldName: string): string | null {
    const mapping: Record<string, string> = {
      inputNodeId: 'previous_nodes',
      memoryIntegration: 'connected_integrations',
      customMemoryIntegrations: 'connected_integrations',
      contextNodeIds: 'previous_nodes'
    }
    return mapping[fieldName] || null
  }
}
