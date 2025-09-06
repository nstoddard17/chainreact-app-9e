# AI Agent Chain Builder Architecture Documentation

## Overview
The AI Agent Chain Builder is a sophisticated visual workflow system that allows users to create multiple parallel execution chains within an AI Agent node. This document captures the complete architecture as of January 2025, enabling full restoration if needed.

## Core Components

### 1. AIAgentConfigModal (`/components/workflows/AIAgentConfigModal.tsx`)
**Purpose**: Main configuration interface for AI Agent nodes

**Key Features**:
- Multi-tab interface (Prompt, Model, Actions, Advanced settings)
- Chain management and visualization
- Integration with workflow builder

**State Management**:
```typescript
const [config, setConfig] = useState({
  title: 'AI Agent',
  systemPrompt: '',
  model: 'gpt-4o-mini',
  apiSource: 'chainreact',
  customApiKey: '',
  tone: 'professional',
  temperature: 0.7,
  maxTokens: 2000,
  outputFormat: 'text',
  includeContext: true,
  enableSafety: true,
  maxRetries: 3,
  timeout: 30000,
  targetActions: [] as string[],
  chains: [] as any[],          // Array of chain configurations
  chainsLayout: null as any     // Full layout data with positions
})
```

**Critical Functions**:
- `handleSave()`: Saves complete configuration including chains and layout
- `onAddActionToWorkflow()`: Bridges actions from chain builder to main workflow

### 2. AIAgentVisualChainBuilder (`/components/workflows/AIAgentVisualChainBuilder.tsx`)
**Purpose**: Visual chain builder using ReactFlow

This is the main component that renders the visual chain builder interface.

#### Key Features:
- **Initialization with Layout Data** (lines 1224-1349): 
  - Accepts `chainsLayout` prop containing full node/edge layout from saved configurations
  - Recreates exact saved layouts when reopening
  - Falls back to simple chains array for backward compatibility

- **Chain Management**:
  - Creates new chains with unique IDs (pattern: `chain-{timestamp}-start`)
  - Each chain starts as a placeholder node that can accept actions
  - Maintains proper spacing (250px horizontal, 120px vertical)

- **Action Management**:
  - `handleAddActionToChain` (main action addition logic)
  - `handleAddNodeBetween` (inserting actions between existing ones)
  - `handleAddActionAfter` (adding actions after existing ones)
  - Actions maintain relative positions when added

- **Layout Synchronization**:
  - `syncChainsToParent` function syncs full layout to parent component
  - Passes complete node/edge data structure, not just action arrays
  - Preserves exact positioning and connections

**Node Types**:
- `custom`: Standard action nodes
- `addAction`: Add action buttons
- `chain_placeholder`: Empty chain placeholders

**Data Flow**:
```typescript
// Full layout data structure passed to parent
const fullLayoutData = {
  chains: extractedChains,              // Action configurations
  chainPlaceholderPositions,            // Empty chain positions
  nodes: actionNodes.map(n => ({       // All nodes with positions
    id: n.id,
    type: n.data?.type,
    providerId: n.data?.providerId,
    config: n.data?.config || {},
    title: n.data?.title,
    description: n.data?.description,
    position: n.position
  })),
  edges: actionEdges.map(e => ({       // Node connections
    id: e.id,
    source: e.source,
    target: e.target
  })),
  aiAgentPosition: { x, y },           // AI Agent position
  layout: {
    verticalSpacing: 120,
    horizontalSpacing: 150
  },
  emptiedChains: emptiedChains         // Tracking emptied chains
}
```

### 3. Integration with Main Workflow Builder

#### Node Creation Pattern
When AI Agent saves chains to main workflow:

1. **Node ID Generation**:
```typescript
// Format: {aiAgentId}-{originalNodeId}-{timestamp}
const newNodeId = `${aiAgentNode.id}-${action.id}-${timestamp}`
```

2. **Position Calculation**:
```typescript
// Chains positioned horizontally
const baseX = aiAgentNode.position.x - (totalChains - 1) * 75
const chainX = baseX + chainIndex * 150
// Actions positioned vertically within chain
const actionY = aiAgentNode.position.y + 150 + actionIndex * 120
```

3. **Edge Creation**:
```typescript
// All edges include onAddNode handler for insertion
const newEdge = {
  id: edgeId,
  source: sourceId,
  target: targetId,
  type: 'custom',
  data: {
    onAddNode: (pos) => handleAddNodeBetween(sourceId, targetId, pos)
  }
}
```

### 3. AIAgentCustomNode.tsx
**Location**: `/components/workflows/AIAgentCustomNode.tsx`

Custom node component for rendering AI Agent and action nodes.

#### Features:
- Renders AI Agent node with chain connections
- Renders action nodes with configuration
- Handles node interactions (configure, delete, rename)
- Shows Add Action buttons for chains

### 4. AddActionNode.tsx
**Location**: `/components/workflows/AddActionNode.tsx`

Simple component for Add Action buttons.

#### Features:
- Renders dashed circle button with plus icon
- Triggers onClick callback when clicked
- Used at the end of each chain

#### Chain Processing in CollaborativeWorkflowBuilder

**Chain Decision Logic**:
```typescript
// Determine how to process AI Agent configuration
if (chainsLayout?.nodes && chainsLayout?.edges) {
  // Use full layout for exact recreation
  processFullLayout(chainsLayout)
} else if (config.chains && config.chains.length > 0) {
  // Fall back to chains array
  processChainsArray(config.chains)
}
```

**Add Action Node Creation**:
```typescript
// Add Action nodes created at end of each chain
const addActionId = `add-action-${aiAgentId}-chain${chainIndex}-${timestamp}`
const addActionNode = {
  id: addActionId,
  type: 'addAction',
  position: { 
    x: lastNode.position.x, 
    y: lastNode.position.y + 120 
  },
  data: {
    chainId: chainIndex,
    parentAIAgentId: aiAgentId,
    onClick: () => handleAddToChain(chainIndex)
  }
}
```

#### Chain Detection During Load (lines 1650-1830):
When workflow loads with existing AI Agent:

1. **Node Identification**:
   - Finds nodes with `isAIAgentChild` and `parentAIAgentId` metadata
   - Falls back to ID pattern matching (`{aiAgentId}-chain{index}-action{index}`)

2. **Chain Grouping**:
   - Groups nodes by `parentChainIndex` metadata
   - Follows edge connections to find connected nodes
   - Creates chain groups for Add Action placement

3. **Add Action Creation**:
   - Creates Add Action after last node in each chain
   - Creates placeholder Add Actions for empty chains
   - Respects `emptiedChains` flag to avoid recreating deleted chains

## Critical Handlers and Callbacks

### Action Selection Flow
1. User clicks "Add Action" in chain
2. Chain builder sets callback via `onActionSelect`
3. Parent opens action selection dialog
4. User selects action
5. Callback invoked with action and config
6. Action added to specific chain

```typescript
// In AIAgentVisualChainBuilder
onAddAction: () => {
  const chainId = defaultChainId
  if (onActionSelect) {
    const callbackFn = (action, config) => {
      if (action && action.type) {
        handleAddActionToChainRef.current?.(chainId, action, config)
      }
    }
    onActionSelect(callbackFn)
  }
  if (onOpenActionDialog) {
    onOpenActionDialog()
  }
}
```

### Node Insertion Between Actions
```typescript
// In AIAgentVisualChainBuilder
const handleAddNodeBetween = (sourceId, targetId, position) => {
  // Set callback for action selection
  onActionSelect((action, config) => {
    const newNodeId = `node-${Date.now()}`
    
    // Insert node at target position
    setNodes(currentNodes => {
      const targetNode = currentNodes.find(n => n.id === targetId)
      const newNode = {
        id: newNodeId,
        type: 'custom',
        position: targetNode.position,
        data: { ...actionData }
      }
      
      // Shift downstream nodes
      const updatedNodes = currentNodes.map(node => {
        if (node.position.y >= targetNode.position.y) {
          return {
            ...node,
            position: { ...node.position, y: node.position.y + 120 }
          }
        }
        return node
      })
      
      return [...updatedNodes, newNode]
    })
    
    // Update edges to insert new node
    setEdges(eds => {
      const filtered = eds.filter(e => 
        !(e.source === sourceId && e.target === targetId)
      )
      return [
        ...filtered,
        { id: `e-${sourceId}-${newNodeId}`, source: sourceId, target: newNodeId },
        { id: `e-${newNodeId}-${targetId}`, source: newNodeId, target: targetId }
      ]
    })
  })
  
  onOpenActionDialog()
}
```

## Key Patterns and Logic

### 1. Chain ID Pattern
```
chain-{timestamp}-start  // New chain placeholder
node-{timestamp}         // Action node
add-action-{aiAgentId}-chain{index}-{timestamp}-{random}  // Add Action node
```

### 2. Node Metadata Structure
```javascript
{
  isAIAgentChild: true,      // Marks node as AI Agent child
  parentAIAgentId: "...",    // Parent AI Agent ID
  parentChainIndex: 0,       // Chain index (0, 1, 2...)
  isChainAddAction: true,    // Marks as chain Add Action
  isPlaceholder: true        // Marks as empty chain placeholder
}
```

### 3. Empty Chain Handling
- When last action in chain is deleted, chain can be marked as "emptied"
- `emptiedChains` array stored in AI Agent config
- Prevents Add Action recreation for intentionally emptied chains

### 4. Position Calculation
```javascript
// Offset calculation for transferring to main workflow
offsetX = aiAgentNode.position.x - (aiAgentPosition?.x || 400)
offsetY = aiAgentNode.position.y - (aiAgentPosition?.y || 200)

// Final position
finalPosition = {
  x: nodePosition.x + offsetX,
  y: nodePosition.y + offsetY
}
```

## State Persistence

### Configuration Storage
AI Agent configuration saved to Supabase includes:
- Basic settings (model, prompt, etc.)
- `chains`: Array of action configurations
- `chainsLayout`: Complete node/edge layout

### Restoration Process
1. Load AI Agent node configuration
2. Check for `chainsLayout` (preferred)
3. Recreate exact node positions and connections
4. Add "Add Action" buttons to chain ends
5. Restore `emptiedChains` tracking

## Key Architectural Decisions

### 1. Dual Data Storage
- `chains`: Simplified action array for execution
- `chainsLayout`: Complete visual layout for restoration
- Ensures both execution and visual fidelity

### 2. Node ID Namespacing
- Chain nodes prefixed with AI Agent ID
- Prevents collisions in main workflow
- Enables chain ownership tracking

### 3. Real-time Synchronization
- 10ms debounce for responsive updates
- Callback refs to avoid stale closures
- Immediate parent notification on changes

### 4. Add Action Button Management
- Dynamically created/removed
- Positioned relative to last chain node
- Click handlers use closures for chain context

## Common Issues and Solutions

### Issue: Add actions between actions not working
**Cause**: Missing or incorrect `onAddNode` handler in edges
**Solution**: Ensure all custom edges have:
```typescript
data: {
  onAddNode: (position) => handleAddNodeBetween(source, target, position)
}
```

### Issue: Chains not restored correctly
**Cause**: Missing chainsLayout data
**Solution**: Always save both chains and chainsLayout:
```typescript
config.chains = extractedChains
config.chainsLayout = fullLayoutData
```

### Issue: Duplicate nodes on save
**Cause**: Not clearing existing chain nodes before recreation
**Solution**: Remove old chain nodes before adding new ones

## Testing Considerations

1. **Chain Creation**: Verify multiple chains can be created
2. **Action Insertion**: Test adding actions between existing ones
3. **Persistence**: Save and reload to verify layout restoration
4. **Edge Handlers**: Confirm plus buttons appear on hover
5. **Position Updates**: Drag nodes and verify Add Actions follow

## Migration Path

If reverting from a new architecture:

1. Restore this exact file structure
2. Ensure chainsLayout is preserved in config
3. Maintain node ID format for chain nodes
4. Keep Add Action node creation logic
5. Preserve edge onAddNode handlers

## Dependencies

- `@xyflow/react`: ^12.0.0
- `framer-motion`: For animations
- `zustand`: State management
- Custom UI components from `/components/ui`

## File Structure
```
/components/workflows/
  ├── AIAgentConfigModal.tsx         # Main config interface
  ├── AIAgentVisualChainBuilder.tsx  # Visual chain builder
  ├── CollaborativeWorkflowBuilder.tsx # Main workflow integration
  ├── CustomNode.tsx                  # Node rendering
  └── AddActionNode.tsx               # Add action buttons
```

---

This documentation represents the complete AI Agent Chain Builder architecture as of January 2025. Any modifications should be carefully considered to maintain backward compatibility with existing workflows.