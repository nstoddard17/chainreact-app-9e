import { ADD_ACTION_NODE_WIDTH } from './layoutConstants.js'

const DEFAULT_PARENT_NODE_WIDTH = 450
const AI_AGENT_NODE_WIDTH = 480

export const getNodeWidth = (node = {}) => {
  const nodeData = node.data ?? {}

  if (typeof nodeData.width === 'number') {
    return nodeData.width
  }

  if (typeof nodeData.nodeWidth === 'number') {
    return nodeData.nodeWidth
  }

  const dimensionsWidth = nodeData?.dimensions?.width
  if (typeof dimensionsWidth === 'number') {
    return dimensionsWidth
  }

  if (nodeData.type === 'ai_agent') {
    return AI_AGENT_NODE_WIDTH
  }

  return DEFAULT_PARENT_NODE_WIDTH
}

export const getCenteredAddActionX = (node = {}) => {
  const baseX = node?.position?.x ?? 0
  const parentWidth = getNodeWidth(node)
  const offset = (parentWidth - ADD_ACTION_NODE_WIDTH) / 2
  return baseX + offset
}

export const getParentCenterX = (node = {}) => {
  const baseX = node?.position?.x ?? 0
  const parentWidth = getNodeWidth(node)
  return baseX + parentWidth / 2
}

export const getAddActionCenterX = (node = {}) => {
  return getCenteredAddActionX(node) + ADD_ACTION_NODE_WIDTH / 2
}

export const __INTERNAL_CONSTANTS__ = {
  DEFAULT_PARENT_NODE_WIDTH,
  AI_AGENT_NODE_WIDTH
}
