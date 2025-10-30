# Complete Integration Development Guide (2025)
**Updated: January 2025 - Current Architecture**

This guide covers EVERYTHING needed to add a new integration from scratch. Follow these steps in order for a working integration on the first try.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: OAuth Setup](#step-1-oauth-setup)
3. [Step 2: Add Provider Icon](#step-2-add-provider-icon)
4. [Step 3: Define Node Schemas](#step-3-define-node-schemas)
5. [Step 4: Create API Data Handlers](#step-4-create-api-data-handlers)
6. [Step 5: Implement Action/Trigger Logic](#step-5-implement-actiontrigger-logic)
7. [Step 6: Register Integration](#step-6-register-integration)
8. [Step 7: Add to Provider Display Names](#step-7-add-to-provider-display-names)
9. [Step 8: Testing Checklist](#step-8-testing-checklist)

---

## Prerequisites

Before starting, gather:
- [ ] Provider's API documentation
- [ ] OAuth credentials (Client ID, Client Secret)
- [ ] API scopes/permissions needed
- [ ] Provider's official icon (SVG preferred)
- [ ] List of actions/triggers to implement

**Example for Monday.com:**
- API Docs: https://developer.monday.com/api-reference/docs
- OAuth: https://developer.monday.com/apps/docs/oauth
- Icon: Download from official brand assets
- Scopes: `boards:read`, `boards:write`, `workspaces:read`

---

## Step 1: OAuth Setup

### 1.1 Add OAuth Configuration

**File:** `/lib/auth/oauth-config.ts`

```typescript
export const oauthConfig = {
  // ... existing providers

  monday: {
    name: "Monday.com",
    authUrl: "https://auth.monday.com/oauth2/authorize",
    tokenUrl: "https://auth.monday.com/oauth2/token",
    scopes: ["boards:read", "boards:write", "workspaces:read", "me:read"],
    scopeSeparator: " ",
    clientId: process.env.MONDAY_CLIENT_ID!,
    clientSecret: process.env.MONDAY_CLIENT_SECRET!,
    redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/monday`,
    responseType: "code",
    grantType: "authorization_code",
    pkce: false,
  },
};
```

### 1.2 Add Environment Variables

**File:** `.env.local`

```bash
# Monday.com OAuth
MONDAY_CLIENT_ID=your_client_id_here
MONDAY_CLIENT_SECRET=your_client_secret_here
```

### 1.3 Create OAuth Callback Handler

**File:** `/app/api/auth/callback/monday/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(
      new URL("/integrations?error=no_code", request.url)
    );
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://auth.monday.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: process.env.MONDAY_CLIENT_ID,
        client_secret: process.env.MONDAY_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/monday`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange code for token");
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userResponse = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "query { me { id name email } }"
      }),
    });

    const userData = await userResponse.json();
    const user = userData.data?.me;

    // Save to database
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user: authUser } } = await supabase.auth.getUser();

    await supabase.from("integrations").insert({
      user_id: authUser?.id,
      provider: "monday",
      provider_user_id: user.id,
      provider_user_email: user.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: ["boards:read", "boards:write", "workspaces:read"],
      status: "connected",
      metadata: {
        user_name: user.name,
      },
    });

    return NextResponse.redirect(
      new URL("/integrations?success=monday", request.url)
    );
  } catch (error) {
    console.error("OAuth error:", error);
    return NextResponse.redirect(
      new URL("/integrations?error=oauth_failed", request.url)
    );
  }
}
```

### 1.4 Create OAuth Initiate Endpoint

**File:** `/app/api/auth/oauth/monday/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const authUrl = new URL("https://auth.monday.com/oauth2/authorize");

  authUrl.searchParams.set("client_id", process.env.MONDAY_CLIENT_ID!);
  authUrl.searchParams.set(
    "redirect_uri",
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/monday`
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "boards:read boards:write workspaces:read me:read");

  return NextResponse.redirect(authUrl.toString());
}
```

---

## Step 2: Add Provider Icon

### 2.1 Add SVG Icon

**File:** `/public/integrations/monday.svg`

Download the official Monday.com icon and save it here. Ensure:
- Format: SVG
- Size: Optimized (< 10KB)
- Colors: Official brand colors

### 2.2 Verify Icon Display

Test that the icon shows correctly:
```typescript
<img src="/integrations/monday.svg" alt="Monday.com" />
```

---

## Step 3: Define Node Schemas

### 3.1 Create Provider Node File

**File:** `/lib/workflows/nodes/providers/monday/index.ts`

```typescript
import { Calendar, CheckSquare, FileText } from "lucide-react";
import { NodeComponent } from "../../types";

export const mondayNodes: NodeComponent[] = [
  // ============================================================================
  // TRIGGERS
  // ============================================================================
  {
    type: "monday_trigger_item_created",
    title: "Item Created",
    description: "Triggers when a new item is created in a Monday.com board",
    icon: CheckSquare,
    providerId: "monday",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        description: "The Monday.com board to monitor",
        placeholder: "Select a board",
        dynamic: "monday_boards",
        required: true,
        loadOnMount: true,
      },
      {
        name: "groupId",
        label: "Group (Optional)",
        type: "select",
        description: "Only trigger for items in this group",
        placeholder: "Any group",
        dynamic: "monday_groups",
        dependsOn: "boardId",
        required: false,
      },
    ],
    outputSchema: [
      { name: "itemId", label: "Item ID", type: "string", description: "The ID of the created item" },
      { name: "itemName", label: "Item Name", type: "string", description: "The name of the created item" },
      { name: "boardId", label: "Board ID", type: "string", description: "The board containing the item" },
      { name: "boardName", label: "Board Name", type: "string", description: "The name of the board" },
      { name: "groupId", label: "Group ID", type: "string", description: "The group containing the item" },
      { name: "groupTitle", label: "Group Title", type: "string", description: "The title of the group" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the item was created" },
      { name: "creatorId", label: "Creator ID", type: "string", description: "ID of user who created the item" },
      { name: "columnValues", label: "Column Values", type: "object", description: "All column values" },
    ],
  },

  // ============================================================================
  // ACTIONS
  // ============================================================================
  {
    type: "monday_action_create_item",
    title: "Create Item",
    description: "Create a new item in a Monday.com board",
    icon: FileText,
    providerId: "monday",
    category: "Productivity",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        description: "The board to create the item in",
        placeholder: "Select a board",
        dynamic: "monday_boards",
        required: true,
        loadOnMount: true,
      },
      {
        name: "groupId",
        label: "Group",
        type: "select",
        description: "The group to add the item to",
        placeholder: "Select a group",
        dynamic: "monday_groups",
        dependsOn: "boardId",
        required: true,
      },
      {
        name: "itemName",
        label: "Item Name",
        type: "text",
        description: "The name of the new item",
        placeholder: "New task",
        required: true,
        hasVariablePicker: true,
      },
      {
        name: "columnValues",
        label: "Column Values (JSON)",
        type: "json",
        description: "Additional column values as JSON",
        placeholder: '{"status": {"label": "Working on it"}}',
        required: false,
        hasVariablePicker: true,
      },
    ],
    outputSchema: [
      { name: "itemId", label: "Item ID", type: "string", description: "The ID of the created item" },
      { name: "itemName", label: "Item Name", type: "string", description: "The name of the created item" },
      { name: "boardId", label: "Board ID", type: "string", description: "The board containing the item" },
      { name: "groupId", label: "Group ID", type: "string", description: "The group containing the item" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the item was created" },
    ],
  },

  {
    type: "monday_action_update_item",
    title: "Update Item",
    description: "Update an existing item in Monday.com",
    icon: CheckSquare,
    providerId: "monday",
    category: "Productivity",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    configSchema: [
      {
        name: "boardId",
        label: "Board",
        type: "select",
        description: "The board containing the item",
        placeholder: "Select a board",
        dynamic: "monday_boards",
        required: true,
        loadOnMount: true,
      },
      {
        name: "itemId",
        label: "Item ID",
        type: "text",
        description: "The ID of the item to update",
        placeholder: "123456789",
        required: true,
        hasVariablePicker: true,
      },
      {
        name: "columnValues",
        label: "Column Values (JSON)",
        type: "json",
        description: "Column values to update as JSON",
        placeholder: '{"status": {"label": "Done"}}',
        required: true,
        hasVariablePicker: true,
      },
    ],
    outputSchema: [
      { name: "itemId", label: "Item ID", type: "string", description: "The ID of the updated item" },
      { name: "success", label: "Success", type: "boolean", description: "Whether the update succeeded" },
    ],
  },
];
```

### 3.2 Export from Index

**File:** `/lib/workflows/nodes/index.ts`

```typescript
// Add import
import { mondayNodes } from "./providers/monday";

// Add to BASE_NODE_COMPONENTS
const BASE_NODE_COMPONENTS: NodeComponent[] = [
  // ... existing nodes
  ...mondayNodes,
];
```

---

## Step 4: Create API Data Handlers

### 4.1 Create Data Handler Route

**File:** `/app/api/integrations/monday/data/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { mondayDataHandlers } from "./handlers";

export async function POST(request: NextRequest) {
  try {
    const { integrationId, dataType, options } = await request.json();

    // Get integration from database
    const supabase = createRouteHandlerClient({ cookies });
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("provider", "monday")
      .single();

    if (error || !integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    // Route to appropriate handler
    const handler = mondayDataHandlers[dataType];
    if (!handler) {
      return NextResponse.json(
        { error: `Unknown data type: ${dataType}` },
        { status: 400 }
      );
    }

    const result = await handler(integration, options);
    return NextResponse.json({ data: result });
  } catch (error: any) {
    console.error("Monday.com data handler error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 4.2 Create Individual Handlers

**File:** `/app/api/integrations/monday/data/handlers/index.ts`

```typescript
export { getMondayBoards } from "./boards";
export { getMondayGroups } from "./groups";

export const mondayDataHandlers: Record<string, any> = {
  monday_boards: getMondayBoards,
  monday_groups: getMondayGroups,
};
```

**File:** `/app/api/integrations/monday/data/handlers/boards.ts`

```typescript
export async function getMondayBoards(integration: any, options?: any) {
  try {
    const response = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query {
          boards {
            id
            name
            description
            state
            workspace {
              id
              name
            }
          }
        }`
      }),
    });

    if (!response.ok) {
      throw new Error(`Monday.com API error: ${response.status}`);
    }

    const data = await response.json();
    const boards = data.data?.boards || [];

    return boards.map((board: any) => ({
      value: board.id,
      label: board.name,
      description: board.description,
      workspace: board.workspace?.name,
    }));
  } catch (error) {
    console.error("Error fetching Monday.com boards:", error);
    return [];
  }
}
```

**File:** `/app/api/integrations/monday/data/handlers/groups.ts`

```typescript
export async function getMondayGroups(integration: any, options?: any) {
  const { boardId } = options || {};

  if (!boardId) {
    console.warn("No boardId provided for monday_groups");
    return [];
  }

  try {
    const response = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query {
          boards(ids: [${boardId}]) {
            groups {
              id
              title
              color
              position
            }
          }
        }`
      }),
    });

    if (!response.ok) {
      throw new Error(`Monday.com API error: ${response.status}`);
    }

    const data = await response.json();
    const groups = data.data?.boards[0]?.groups || [];

    return groups.map((group: any) => ({
      value: group.id,
      label: group.title,
      color: group.color,
    }));
  } catch (error) {
    console.error("Error fetching Monday.com groups:", error);
    return [];
  }
}
```

---

## Step 5: Implement Action/Trigger Logic

### 5.1 Create Action Handler

**File:** `/lib/workflows/actions/monday/createItem.ts`

```typescript
import { logger } from "@/lib/utils/logger";

export async function mondayCreateItem(
  nodeData: any,
  executionData: any,
  integration: any
) {
  const { boardId, groupId, itemName, columnValues } = nodeData.config;

  try {
    logger.info("Creating Monday.com item", { boardId, groupId, itemName });

    let columnValuesJson = "{}";
    if (columnValues) {
      columnValuesJson = typeof columnValues === "string"
        ? columnValues
        : JSON.stringify(columnValues);
    }

    const mutation = `mutation {
      create_item (
        board_id: ${boardId},
        group_id: "${groupId}",
        item_name: "${itemName.replace(/"/g, '\\"')}",
        column_values: "${columnValuesJson.replace(/"/g, '\\"')}"
      ) {
        id
        name
        created_at
      }
    }`;

    const response = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: mutation }),
    });

    if (!response.ok) {
      throw new Error(`Monday.com API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`Monday.com error: ${data.errors[0].message}`);
    }

    const item = data.data.create_item;

    logger.info("Monday.com item created successfully", { itemId: item.id });

    return {
      success: true,
      data: {
        itemId: item.id,
        itemName: item.name,
        boardId,
        groupId,
        createdAt: item.created_at,
      },
    };
  } catch (error: any) {
    logger.error("Error creating Monday.com item", { error: error.message });
    throw error;
  }
}
```

### 5.2 Register Action Handler

**File:** `/lib/workflows/executeNode.ts`

```typescript
// Add import
import { mondayCreateItem } from "./actions/monday/createItem";

// In the executeNode function
case "monday_action_create_item":
  result = await mondayCreateItem(nodeData, executionData, integration);
  break;

case "monday_action_update_item":
  result = await mondayUpdateItem(nodeData, executionData, integration);
  break;
```

### 5.3 Create Trigger Lifecycle (if using webhooks)

**File:** `/lib/triggers/providers/MondayTriggerLifecycle.ts`

```typescript
import { TriggerLifecycle, TriggerActivationContext, TriggerDeactivationContext } from "../types";

export class MondayTriggerLifecycle implements TriggerLifecycle {
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeConfig, integration } = context;

    // Create webhook subscription in Monday.com
    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/workflows/monday/webhook?workflowId=${workflowId}`;

    const response = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `mutation {
          create_webhook (
            board_id: ${nodeConfig.boardId},
            url: "${webhookUrl}",
            event: create_item
          ) {
            id
          }
        }`
      }),
    });

    const data = await response.json();
    const webhookId = data.data.create_webhook.id;

    // Save to trigger_resources table
    await context.supabase.from("trigger_resources").insert({
      workflow_id: workflowId,
      external_id: webhookId,
      resource_type: "webhook",
      provider: "monday",
      status: "active",
    });
  }

  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    // Delete webhook from Monday.com
    const { resources, integration } = context;

    for (const resource of resources) {
      await fetch("https://api.monday.com/v2", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `mutation {
            delete_webhook (webhook_id: ${resource.external_id}) {
              id
            }
          }`
        }),
      });
    }
  }

  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    await this.onDeactivate(context);
  }

  async checkHealth(workflowId: string, userId: string): Promise<any> {
    // Implementation for health checks
    return { status: "healthy" };
  }
}
```

### 5.4 Register Trigger Lifecycle

**File:** `/lib/triggers/index.ts`

```typescript
import { MondayTriggerLifecycle } from "./providers/MondayTriggerLifecycle";

export const triggerRegistry: Record<string, TriggerLifecycle> = {
  // ... existing triggers
  monday_trigger_item_created: new MondayTriggerLifecycle(),
};
```

---

## Step 6: Register Integration

### 6.1 Add to Available Integrations

**File:** `/app/api/integrations/available/route.ts`

```typescript
export async function GET() {
  const integrations = [
    // ... existing integrations
    {
      id: "monday",
      name: "Monday.com",
      description: "Work OS for teams",
      icon: "/integrations/monday.svg",
      category: "Productivity",
      color: "bg-[#FF3D57]",
      textColor: "text-white",
      comingSoon: false,
    },
  ];

  return NextResponse.json(integrations);
}
```

---

## Step 7: Add to Provider Display Names

**File:** `/lib/workflows/builder/providerNames.ts`

```typescript
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  // ... existing providers
  monday: "Monday.com",
};
```

---

## Step 8: Testing Checklist

### Pre-Deployment Tests

- [ ] **OAuth Flow**
  - [ ] Initiate OAuth from integrations page
  - [ ] Successful callback and token storage
  - [ ] User info displayed correctly
  - [ ] Token refresh works (if applicable)

- [ ] **Node Display**
  - [ ] Nodes appear in node catalog
  - [ ] Icons display correctly
  - [ ] Categories are correct
  - [ ] Descriptions are clear

- [ ] **Field Loading**
  - [ ] Dynamic fields load data (boards, groups, etc.)
  - [ ] Dependent fields update correctly
  - [ ] Error states handled gracefully
  - [ ] Empty states handled

- [ ] **Action Execution**
  - [ ] Create item works
  - [ ] Update item works
  - [ ] Output data is correct
  - [ ] Error handling works
  - [ ] Logging is appropriate (no tokens/secrets)

- [ ] **Trigger Activation**
  - [ ] Webhook created on activation
  - [ ] Webhook receives events
  - [ ] Workflow executes on trigger
  - [ ] Webhook deleted on deactivation

- [ ] **AI Integration**
  - [ ] AI can find and use nodes
  - [ ] AI generates correct node configs
  - [ ] Field mappings work
  - [ ] Variable resolution works

---

## 🎯 Complete Checklist for Monday.com (or any provider)

### Phase 1: Setup
- [ ] OAuth credentials obtained
- [ ] `.env.local` updated
- [ ] OAuth config added to `oauth-config.ts`
- [ ] Callback handler created
- [ ] OAuth initiate endpoint created

### Phase 2: Visual Assets
- [ ] Icon downloaded and added to `/public/integrations/`
- [ ] Icon displays correctly in UI
- [ ] Provider added to available integrations

### Phase 3: Node Definitions
- [ ] Node file created in `/lib/workflows/nodes/providers/monday/`
- [ ] All triggers defined with schemas
- [ ] All actions defined with schemas
- [ ] Output schemas defined
- [ ] Nodes exported from `/lib/workflows/nodes/index.ts`

### Phase 4: API Handlers
- [ ] Main data route created
- [ ] Handler registry created
- [ ] Individual handlers implemented (boards, groups, etc.)
- [ ] Error handling added
- [ ] Response formatting correct

### Phase 5: Action/Trigger Logic
- [ ] Action handlers created in `/lib/workflows/actions/monday/`
- [ ] Actions registered in `executeNode.ts`
- [ ] Trigger lifecycle created (if webhooks)
- [ ] Triggers registered in `/lib/triggers/index.ts`
- [ ] Logging added (no sensitive data)

### Phase 6: Integration
- [ ] Provider added to display names
- [ ] Field type icons configured
- [ ] Testing completed
- [ ] Documentation updated

---

## 📝 Final Notes

Following this guide exactly will result in a **fully functional integration on the first try**. The system is designed to work cohesively - as long as all pieces are in place, everything will work together automatically.

**Time Estimate:**
- Simple integration (2-3 actions, no webhooks): **2-3 hours**
- Medium integration (5-8 actions, webhooks): **4-6 hours**
- Complex integration (10+ actions, advanced features): **8-12 hours**

**Key Success Factors:**
1. Follow naming conventions exactly
2. Test OAuth flow first
3. Use correct field types in schemas
4. Handle errors gracefully
5. Log appropriately (never log tokens/secrets)
6. Test with real data

---

## 🚀 Next Steps After Implementation

1. **Test thoroughly** with real workflows
2. **Add example templates** showcasing the integration
3. **Document limitations** and API quirks
4. **Monitor API usage** and rate limits
5. **Create marketing materials** announcing the integration
6. **Update user documentation**

---

**Questions or Issues?**
- Refer to existing integrations (Discord, Gmail, Airtable) as examples
- Check `/learning/docs/action-trigger-implementation-guide.md` for deeper details
- Review error logs for debugging hints
