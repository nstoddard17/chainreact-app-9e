# Node Migration Guide

## Overview
This guide explains how to migrate node definitions from the monolithic `availableNodes.ts` file to the new modular structure.

## Directory Structure

```
/lib/workflows/nodes/
├── types.ts                          # Shared type definitions
├── index.ts                           # Main aggregation file
└── providers/
    └── [provider-name]/               # e.g., gmail, slack, notion
        ├── index.ts                   # Provider aggregation & icon application
        ├── actions/
        │   └── [actionName].schema.ts # Individual action schemas
        └── triggers/
            └── [triggerName].schema.ts # Individual trigger schemas
```

## Migration Steps

### 1. Create Provider Directory Structure
```bash
mkdir -p lib/workflows/nodes/providers/[provider]/actions
mkdir -p lib/workflows/nodes/providers/[provider]/triggers
```

### 2. Extract Node Definitions

For each node where `providerId: "[provider]"`:

#### For Actions (type: `[provider]_action_*`):
Create file: `providers/[provider]/actions/[actionName].schema.ts`

```typescript
import { NodeComponent } from "../../../types"

// Define metadata locally (since @/integrations imports may not work)
const [PROVIDER]_[ACTION]_METADATA = {
  key: "[provider]_action_[action]",
  name: "Action Name",
  description: "Action description"
}

export const [actionName]ActionSchema: NodeComponent = {
  type: [PROVIDER]_[ACTION]_METADATA.key,
  title: [PROVIDER]_[ACTION]_METADATA.name,
  description: [PROVIDER]_[ACTION]_METADATA.description,
  icon: "[IconName]" as any, // Will be resolved in index file
  providerId: "[provider]",
  category: "Communication", // or appropriate category
  isTrigger: false,
  requiredScopes: [...], // if applicable
  configSchema: [
    // Copy all field definitions
  ],
  outputSchema: [
    // Copy all output definitions if present
  ]
}
```

#### For Triggers (type: `[provider]_trigger_*`):
Create file: `providers/[provider]/triggers/[triggerName].schema.ts`

```typescript
import { NodeComponent } from "../../../types"

export const [triggerName]TriggerSchema: NodeComponent = {
  type: "[provider]_trigger_[trigger]",
  title: "Trigger Title",
  description: "Trigger description",
  icon: "[IconName]" as any, // Will be resolved in index file
  providerId: "[provider]",
  category: "Communication", // or appropriate category
  isTrigger: true,
  producesOutput: true, // usually true for triggers
  configSchema: [
    // Copy all field definitions
  ],
  outputSchema: [
    // Copy all output definitions
  ]
}
```

### 3. Create Provider Index File

Create `providers/[provider]/index.ts`:

```typescript
import { IconName1, IconName2, ... } from "lucide-react"
import { NodeComponent } from "../../types"

// Import action schemas
import { action1Schema } from "./actions/action1.schema"
import { action2Schema } from "./actions/action2.schema"

// Import trigger schemas
import { trigger1Schema } from "./triggers/trigger1.schema"
import { trigger2Schema } from "./triggers/trigger2.schema"

// Apply icons to actions
const action1: NodeComponent = {
  ...action1Schema,
  icon: IconName1
}

const action2: NodeComponent = {
  ...action2Schema,
  icon: IconName2
}

// Apply icons to triggers
const trigger1: NodeComponent = {
  ...trigger1Schema,
  icon: IconName1
}

const trigger2: NodeComponent = {
  ...trigger2Schema,
  icon: IconName2
}

// Export all provider nodes
export const [provider]Nodes: NodeComponent[] = [
  // Actions
  action1,
  action2,

  // Triggers
  trigger1,
  trigger2,
]

// Export individual nodes for direct access
export {
  action1,
  action2,
  trigger1,
  trigger2,
}
```

### 4. Update Main Index

Add to `/lib/workflows/nodes/index.ts`:

```typescript
import { [provider]Nodes } from "./providers/[provider]"

export const ALL_NODE_COMPONENTS: NodeComponent[] = [
  ...existingNodes,
  ...[provider]Nodes,
]
```

## Naming Conventions

- **Files**: Use camelCase with `.schema.ts` suffix
  - Actions: `sendEmail.schema.ts`, `createRecord.schema.ts`
  - Triggers: `newMessage.schema.ts`, `recordCreated.schema.ts`

- **Schema Exports**: Use descriptive names with type suffix
  - Actions: `sendEmailActionSchema`, `createRecordActionSchema`
  - Triggers: `newMessageTriggerSchema`, `recordCreatedTriggerSchema`

- **Index Exports**: Use clean names without suffix
  - `sendEmail`, `createRecord`, `newMessage`, `recordCreated`

## Icon Mapping

Icons are imported from `lucide-react` in the index file and applied to schemas:
- Mail → Email-related actions
- MessageSquare → Message/chat actions
- Hash → Channel/group actions
- Heart → Reaction/like actions
- UserPlus/UserMinus → Member actions
- Calendar → Calendar/event actions
- FileText → Document actions
- Database → Database/record actions

## Common Patterns

### Dynamic Fields
Fields with `dynamic: "provider_resource"` load options from the API:
```typescript
{
  name: "channel",
  label: "Channel",
  type: "select",
  dynamic: "slack-channels", // or "notion_pages", "gmail_labels", etc.
  required: true,
  description: "Select a channel"
}
```

### File Attachments
```typescript
{
  name: "attachments",
  label: "Attachments",
  type: "file",
  required: false,
  accept: ".pdf,.doc,.docx,...",
  maxSize: 25 * 1024 * 1024, // 25MB
  description: "Attach files"
}
```

### Output Schemas
Always include for triggers and actions that produce output:
```typescript
outputSchema: [
  {
    name: "id",
    label: "Record ID",
    type: "string",
    description: "Unique identifier",
    example: "rec_123" // optional
  }
]
```

## Testing

After migration, test compilation:
```bash
npx tsc --noEmit --skipLibCheck "lib/workflows/nodes/providers/[provider]/index.ts"
```

## Progress Tracking

### ✅ Completed
- Gmail (4 nodes)
- Slack (4 nodes - partial, 9 more to migrate)

### 🚧 In Progress
- Slack (remaining 9 nodes)

### 📋 To Do
- Discord (19 nodes)
- Notion (9 nodes)
- Microsoft Outlook (16 nodes)
- Microsoft Teams (11 nodes)
- Microsoft OneNote (11 nodes)
- HubSpot (14 nodes)
- Airtable (6 nodes)
- Google Sheets (7 nodes)
- Google Calendar (4 nodes)
- Google Docs (6 nodes)
- YouTube (7 nodes)
- Twitter (17 nodes)
- Stripe (10 nodes)
- Trello (9 nodes)
- GitHub (6 nodes)
- GitLab (5 nodes)
- Facebook (6 nodes)
- Instagram (4 nodes)
- LinkedIn (4 nodes)
- TikTok (6 nodes)
- Shopify (5 nodes)
- OneDrive (5 nodes)
- Dropbox (3 nodes)
- Box (5 nodes)
- PayPal (4 nodes)
- And more...

Total: ~240+ nodes to migrate