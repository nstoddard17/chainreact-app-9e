import { logger } from '@/lib/utils/logger'

/**
 * Node Registry System
 * Manages registration and retrieval of workflow nodes from all providers
 */

import type { NodeComponent } from './types'

class NodeRegistry {
  private nodes: NodeComponent[] = []
  private nodesByProvider: Map<string, NodeComponent[]> = new Map()
  private nodesByType: Map<string, NodeComponent> = new Map()

  /**
   * Register a single node
   */
  registerNode(node: NodeComponent): void {
    // Avoid duplicates
    if (this.nodesByType.has(node.type)) {
      logger.warn(`Node type ${node.type} already registered, skipping...`)
      return
    }

    this.nodes.push(node)
    this.nodesByType.set(node.type, node)

    // Group by provider
    if (node.providerId) {
      const providerNodes = this.nodesByProvider.get(node.providerId) || []
      providerNodes.push(node)
      this.nodesByProvider.set(node.providerId, providerNodes)
    }
  }

  /**
   * Register multiple nodes at once
   */
  registerNodes(nodes: NodeComponent[]): void {
    nodes.forEach(node => this.registerNode(node))
  }

  /**
   * Get all registered nodes
   */
  getAllNodes(): NodeComponent[] {
    return [...this.nodes]
  }

  /**
   * Get nodes by provider
   */
  getNodesByProvider(providerId: string): NodeComponent[] {
    return this.nodesByProvider.get(providerId) || []
  }

  /**
   * Get a specific node by type
   */
  getNodeByType(type: string): NodeComponent | undefined {
    return this.nodesByType.get(type)
  }

  /**
   * Get all trigger nodes
   */
  getTriggerNodes(): NodeComponent[] {
    return this.nodes.filter(node => node.isTrigger)
  }

  /**
   * Get all action nodes
   */
  getActionNodes(): NodeComponent[] {
    return this.nodes.filter(node => !node.isTrigger)
  }

  /**
   * Clear the registry (useful for testing)
   */
  clear(): void {
    this.nodes = []
    this.nodesByProvider.clear()
    this.nodesByType.clear()
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalNodes: number
    totalProviders: number
    triggers: number
    actions: number
  } {
    return {
      totalNodes: this.nodes.length,
      totalProviders: this.nodesByProvider.size,
      triggers: this.getTriggerNodes().length,
      actions: this.getActionNodes().length,
    }
  }
}

// Create singleton instance
export const nodeRegistry = new NodeRegistry()

// Export convenience functions
export const registerNodes = (nodes: NodeComponent[]) => nodeRegistry.registerNodes(nodes)
export const getAllNodes = () => nodeRegistry.getAllNodes()
export const getNodesByProvider = (providerId: string) => nodeRegistry.getNodesByProvider(providerId)
export const getNodeByType = (type: string) => nodeRegistry.getNodeByType(type)