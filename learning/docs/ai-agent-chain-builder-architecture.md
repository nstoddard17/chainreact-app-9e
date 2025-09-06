# AI Agent Chain Builder Architecture Documentation

## Overview
The AI Agent Chain Builder is a visual workflow builder specifically designed for creating and managing AI Agent execution chains. It provides a drag-and-drop interface for building multiple parallel chains of actions that the AI Agent can execute.

## Core Components

### 1. AIAgentVisualChainBuilder.tsx
**Location**: `/components/workflows/AIAgentVisualChainBuilder.tsx`

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

#### Data Flow:
```javascript
// Full layout structure passed to parent
{
  nodes: [...],           // All nodes with positions
  edges: [...],          // All connections
  aiAgentPosition: {...}, // AI Agent node position
  chains: [...],         // Chain arrays (legacy)
  layout: {              // Layout configuration
    verticalSpacing: 120,
    horizontalSpacing: 150
  }
}
```

### 2. AIAgentConfigModal.tsx
**Location**: `/components/workflows/AIAgentConfigModal.tsx`

Modal component for configuring AI Agent nodes.

#### Key Features:
- **State Management**:
  - Stores both `chains` (legacy) and `chainsLayout` (full layout)
  - Updates configuration on every chain change
  - Preserves complete visual layout

- **Action Selection** (lines 1729-1970):
  - Opens action selection dialog
  - Handles callback system for action selection
  - Passes selected actions back to chain builder

- **Save Mechanism**:
  - Saves full layout data including node positions
  - Preserves chain metadata (emptiedChains flag)
  - Passes complete configuration to workflow builder

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

## Workflow Builder Integration

### CollaborativeWorkflowBuilder.tsx
**Location**: `/components/workflows/CollaborativeWorkflowBuilder.tsx`

#### Chain Processing (lines 5550-5730):
When AI Agent configuration is saved:

1. **Full Layout Processing** (when chainsLayout available):
   - Creates nodes with exact positions from AI Agent builder
   - Maintains relative positioning based on AI Agent location
   - Preserves all connections and chain structure
   - Groups nodes by chain using edge connections
   - Adds Add Action nodes at the end of each chain

2. **Legacy Chain Processing** (fallback):
   - Processes simple chain arrays
   - Calculates positions based on chain/action indices
   - Creates proper connections to AI Agent

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

## Critical Functions

### syncChainsToParent (AIAgentVisualChainBuilder)
Synchronizes the complete layout to parent component:
- Captures all nodes and edges
- Includes AI Agent position
- Maintains chain structure
- Preserves layout configuration

### handleAddActionToChain (AIAgentVisualChainBuilder)
Adds an action to a specific chain:
- Finds target chain node
- Creates new action node with proper positioning
- Updates edges to maintain connections
- Syncs changes to parent

### Chain Processing in Workflow Builder
When saving AI Agent configuration:
- Checks for existing chain nodes (prevents duplicates)
- Processes full layout data if available
- Creates nodes with exact positions
- Groups nodes by chain
- Adds Add Action nodes

## Current Working State (As of Last Update)

### What Works:
1. ✅ Creating multiple chains in AI Agent builder
2. ✅ Adding actions to specific chains
3. ✅ Adding actions between existing actions
4. ✅ Deleting actions and maintaining chain structure
5. ✅ Saving complete layout to configuration
6. ✅ Recreating exact layout when reopening modal
7. ✅ Visual chain builder with proper spacing
8. ✅ Add New Chain functionality
9. ✅ Preventing recreation of intentionally emptied chains

### Known Issues Fixed:
- ✅ Add Action buttons now appear for all chains
- ✅ Actions maintain relative positions when transferred
- ✅ Duplicate nodes prevented on re-save
- ✅ JavaScript closure issues in callbacks resolved
- ✅ Consistent 120px spacing throughout

### Current Issue:
- Actions not being transferred to main workflow (reverted to investigate)
- Add Action buttons may disappear for non-first chains after save/reload

## Recovery Instructions

If the AI Agent chain builder functionality is broken, refer to this document and:

1. Check that `chainsLayout` is being properly passed and stored
2. Verify `syncChainsToParent` is being called on changes
3. Ensure chain detection logic uses both metadata and ID patterns
4. Confirm Add Action nodes have proper parent references
5. Check that edge connections are being created correctly

The key is maintaining the full layout data structure throughout the save/load cycle, not just the action arrays.