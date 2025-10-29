/**
 * FlowNodes.tsx
 *
 * Single node template for consistent visual appearance across all node types.
 * Uses design tokens for spacing, typography, and states (grey, active, hover).
 */

import React from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import Image from 'next/image'
import { Copy } from './ui/copy'
import './styles/tokens.css'
import styles from './FlowV2Builder.module.css'

export interface FlowNodeData {
  title: string
  type: string
  providerId?: string
  icon?: any
  config?: Record<string, any>
  setupRequired?: boolean
  label?: string
  sublabel?: string
}

/**
 * Standard Flow Node Component
 *
 * Features:
 * - Consistent size: var(--node-width) × auto height
 * - States: .isGrey (pending), .isActive (current), hover (subtle shadow)
 * - Handles: 8px circles, vertically centered, min 16px hit area
 * - Typography: var(--font-md) for title, var(--font-sm) for sublabel
 * - Icons: var(--icon-sm) = 16px
 */
export function FlowNode({ data, selected, dragging }: NodeProps<FlowNodeData>) {
  const NodeIcon = data.icon

  return (
    <div
      className={`flow-node ${styles.card}`}
      style={{
        width: 'var(--node-width)',
        padding: '10px 12px',
        borderRadius: 'var(--node-radius)',
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        cursor: dragging ? 'grabbing' : 'grab',
        transition: 'box-shadow var(--motion-fast) var(--eas-out)',
      }}
    >
      {/* Source Handle (left) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: '8px',
          height: '8px',
          background: 'hsl(var(--primary))',
          border: '2px solid hsl(var(--background))',
          right: '-5px',
        }}
        aria-label="Connect from this node"
      />

      {/* Target Handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: '8px',
          height: '8px',
          background: 'hsl(var(--primary))',
          border: '2px solid hsl(var(--background))',
          left: '-5px',
        }}
        aria-label="Connect to this node"
      />

      {/* Title Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: data.sublabel ? '4px' : '0' }}>
        {/* Icon */}
        {data.providerId ? (
          <Image
            src={`/integrations/${data.providerId}.svg`}
            alt={data.providerId}
            width={16}
            height={16}
            style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)', flexShrink: 0 }}
          />
        ) : NodeIcon ? (
          <NodeIcon style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)', flexShrink: 0 }} />
        ) : null}

        {/* Title */}
        <div style={{ flex: 1, fontSize: 'var(--font-md)', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          {data.title || data.label || data.type}
        </div>

        {/* Setup Required Pill */}
        {data.setupRequired && (
          <div
            style={{
              fontSize: 'var(--font-xs)',
              padding: '2px 6px',
              borderRadius: '10px',
              background: 'hsl(var(--muted))',
              color: 'hsl(var(--muted-foreground))',
              whiteSpace: 'nowrap',
            }}
          >
            • {Copy.setupRequired}
          </div>
        )}
      </div>

      {/* Sublabel */}
      {data.sublabel && (
        <div
          style={{
            fontSize: 'var(--font-sm)',
            color: 'hsl(var(--muted-foreground))',
            marginTop: '2px',
          }}
        >
          {data.sublabel}
        </div>
      )}
    </div>
  )
}

/**
 * Node types mapping for ReactFlow
 * All nodes use the same template for consistency
 */
export const flowNodeTypes = {
  custom: FlowNode,
  // Add other node type mappings if needed, all using FlowNode
}
