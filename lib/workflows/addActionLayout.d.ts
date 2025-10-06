import type { Node } from '@xyflow/react'

export type NodeLike = Pick<Node, 'position' | 'data'> | {
  position?: { x?: number; y?: number }
  data?: Record<string, unknown>
}

export declare const getNodeWidth: (node?: NodeLike) => number
export declare const getCenteredAddActionX: (node?: NodeLike) => number
export declare const getParentCenterX: (node?: NodeLike) => number
export declare const getAddActionCenterX: (node?: NodeLike) => number
export declare const __INTERNAL_CONSTANTS__: {
  DEFAULT_PARENT_NODE_WIDTH: number
  AI_AGENT_NODE_WIDTH: number
}
