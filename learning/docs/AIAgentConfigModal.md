---
title: AI Agent Configuration Modal
date: 2024-12-30
component: AIAgentConfigModal
---

# AI Agent Configuration Modal

A comprehensive modal component for configuring AI agent nodes in workflow builder. This modal provides an intuitive interface for setting up AI agent behavior, input sources, and advanced parameters.

## Overview

The `AIAgentConfigModal` is a sophisticated configuration interface that allows users to:

- Select input nodes from the workflow
- Configure system prompts and tone
- Set AI model parameters (temperature, max tokens, etc.)
- Define memory and context settings
- Test AI responses with sample data

## Props

### Required Props

- `isOpen: boolean` - Controls modal visibility
- `onClose: () => void` - Callback when modal is closed
- `onSave: (config: Record<string, any>) => void` - Callback when configuration is saved

### Optional Props

- `onUpdateConnections?: (sourceNodeId: string, targetNodeId: string) => void` - Callback to update workflow connections
- `initialData?: Record<string, any>` - Initial configuration data
- `workflowData?: { nodes: any[], edges: any[] }` - Current workflow data for node selection
- `currentNodeId?: string` - ID of the current AI agent node

## Key Features

### Dual Close Button Handling

The modal uses a custom `DialogContentWithoutClose` component to prevent the double close button issue that occurs when using the standard Dialog component. This ensures only one close button is visible with enhanced hover effects.

### Enhanced Close Button

The custom close button features:
- Red hover state (`hover:bg-red-50 hover:text-red-600`)
- Scale animation on hover (`group-hover:scale-110`)
- Smooth transitions (`transition-all duration-200`)

### Tabbed Interface

The modal uses a tabbed layout with:
- **Basic Tab**: Core configuration (input node, system prompt, tone, response length)
- **Advanced Tab**: Model settings (temperature, max tokens, output format, memory)

### Real-time Validation

The component includes comprehensive validation for:
- Required input node selection
- System prompt content
- Variable selection and static value configuration

## Usage Example

```tsx
<AIAgentConfigModal
  isOpen={isConfiguring}
  onClose={() => setIsConfiguring(false)}
  onSave={(config) => handleSaveConfiguration(node, config)}
  onUpdateConnections={(sourceId, targetId) => updateWorkflowConnections(sourceId, targetId)}
  initialData={node.config}
  workflowData={{ nodes, edges }}
  currentNodeId={node.id}
/>
```

## Styling

The modal uses a gradient background and modern styling:
- Gradient background: `bg-gradient-to-br from-slate-50 to-white`
- Custom shadow: `shadow-2xl`
- Responsive sizing: `sm:max-w-[1400px] max-h-[95vh]`

## Accessibility

- Proper ARIA labels and descriptions
- Keyboard navigation support
- Screen reader friendly structure
- Focus management for modal interactions 