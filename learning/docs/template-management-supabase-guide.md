# Template Management in Supabase
**Complete Guide to Creating and Editing Workflow Templates**

## Overview

Workflow templates in ChainReact are stored in the `templates` table in Supabase. This guide covers how to create, edit, and manage templates directly in the database.

---

## Database Schema

### Templates Table Structure

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | uuid | ✅ Yes | Auto-generated unique identifier |
| `name` | text | ✅ Yes | Template display name |
| `description` | text | ✅ Yes | Brief description of what the template does |
| `category` | text | ✅ Yes | Category for filtering (see categories list) |
| `tags` | text[] | ❌ Optional | Array of searchable tags |
| `nodes` | jsonb | ✅ Yes | Array of workflow nodes |
| `connections` | jsonb | ✅ Yes | Array of connections between nodes |
| `workflow_json` | jsonb | ❌ Optional | Alternative format (deprecated) |
| `is_public` | boolean | ✅ Yes | Whether template is visible to all users |
| `is_predefined` | boolean | ✅ Yes | Whether template is "official" ChainReact template |
| `difficulty` | text | ❌ Optional | Difficulty level: "Beginner", "Intermediate", "Advanced" |
| `estimatedTime` | text | ❌ Optional | Time estimate (e.g., "5 min", "10-15 min") |
| `integrations` | text[] | ❌ Optional | List of integrations used (for display) |
| `created_by` | uuid | ✅ Yes | User ID who created the template |
| `created_at` | timestamp | ✅ Yes | Auto-generated creation timestamp |
| `updated_at` | timestamp | ❌ Optional | Auto-updated timestamp |

---

## Available Categories

Choose one of these categories for your template:

- `AI Agent Testing` - Templates for testing AI agent capabilities
- `Customer Service` - Support and customer communication workflows
- `Sales & CRM` - Lead management and sales automation
- `Social Media` - Social media monitoring and posting
- `Productivity` - Personal and team productivity workflows
- `Data Sync` - Data synchronization between platforms
- `E-commerce` - Online store automation
- `Notifications` - Alert and notification workflows
- `HR` - Human resources and team management
- `DevOps` - Development and deployment automation
- `Marketing` - Marketing campaign automation
- `Finance` - Financial tracking and reporting

---

## Method 1: Create Template via Workflow Builder (Recommended)

### For Admins Only

1. **Create or edit a workflow** in the workflow builder
2. **Click the "Edit" button** (pencil icon) in the template gallery
3. This copies the template to a workflow
4. **Make your changes** in the workflow builder
5. The system will save changes back to the template

**Note:** This method is currently only available to admins and requires the `editTemplate` query parameter.

---

## Method 2: Create Template Directly in Supabase

### Step 1: Access Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your ChainReact project
3. Navigate to **Table Editor** → **templates**

### Step 2: Export Workflow Data

First, you need to get the workflow structure from an existing workflow:

1. **In ChainReact**, create a workflow with the desired structure
2. **Open browser DevTools** (F12)
3. **Go to the workflow page** and load the workflow
4. **In Console**, run this command:
   ```javascript
   // Get the workflow data
   const workflow = /* your workflow object */
   console.log(JSON.stringify({
     nodes: workflow.nodes,
     connections: workflow.connections
   }, null, 2))
   ```

5. **Copy the output** - you'll use this for the template

**Alternative:** Use the API endpoint:
```bash
GET /api/workflows/{workflowId}
```
Copy the `nodes` and `connections` from the response.

### Step 3: Create Template in Supabase

Click **"Insert row"** in the templates table and fill in:

#### Required Fields:

**name** (text):
```
Smart Email Triage - Sales & Support Router
```

**description** (text):
```
AI automatically categorizes incoming emails and routes them to sales, support, or internal teams with appropriate follow-up actions
```

**category** (text):
```
Customer Service
```

**nodes** (jsonb):
```json
[
  {
    "id": "node-1",
    "type": "custom",
    "position": { "x": 400, "y": 100 },
    "data": {
      "title": "New Email Received",
      "description": "Triggers when a new email arrives in your Gmail inbox",
      "type": "gmail_trigger_new_email",
      "providerId": "gmail",
      "isTrigger": true,
      "config": {
        "labelIds": ["INBOX"]
      }
    }
  },
  {
    "id": "node-2",
    "type": "custom",
    "position": { "x": 400, "y": 250 },
    "data": {
      "title": "Email Classification AI",
      "description": "Analyzes email content and routes to appropriate team",
      "type": "ai_agent",
      "providerId": "ai",
      "config": {
        "model": "gpt-4o-mini",
        "prompt": "Classify this email as 'sales', 'support', or 'internal'...",
        "temperature": 0.3
      }
    }
  }
  // ... more nodes
]
```

**connections** (jsonb):
```json
[
  {
    "id": "edge-1",
    "source": "node-1",
    "target": "node-2",
    "type": "smoothstep"
  }
  // ... more connections
]
```

**is_public** (boolean):
```
true
```

**is_predefined** (boolean):
```
true  (for official templates)
false (for user-created templates)
```

**created_by** (uuid):
```
<admin-user-uuid>
```

#### Optional Fields:

**tags** (text[]):
```json
["AI Agent", "Gmail", "Slack", "Airtable", "Email-routing"]
```

**difficulty** (text):
```
Intermediate
```

**estimatedTime** (text):
```
10-15 min
```

**integrations** (text[]):
```json
["gmail", "ai", "slack", "airtable"]
```

### Step 4: Save and Verify

1. **Click "Save"** in Supabase
2. **Refresh the Templates page** in ChainReact
3. **Verify the template appears** with correct preview
4. **Test copying the template** to ensure it works

---

## Method 3: Create Template via API

### Endpoint
```
POST /api/templates
```

### Example Request
```javascript
const response = await fetch('/api/templates', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: "Lead Capture & Notification",
    description: "Automatically capture leads from Airtable and send notifications to Slack",
    category: "Sales & CRM",
    tags: ["airtable", "slack", "leads", "sales automation"],
    nodes: [/* nodes array */],
    connections: [/* connections array */],
    is_public: true,
    difficulty: "Beginner",
    estimatedTime: "5 min"
  })
})
```

---

## Editing Existing Templates

### Via Supabase Dashboard

1. **Go to Table Editor** → **templates**
2. **Find the template** you want to edit
3. **Click the row** to expand
4. **Edit fields** directly
5. **Click "Save"** to apply changes

### Important Notes:
- ⚠️ **Always test after editing** - JSON syntax errors will break the template
- ⚠️ **Don't edit `id`, `created_at`, or `created_by`**
- ⚠️ **Validate JSON** before saving nodes/connections
- ✅ **Update `updated_at`** manually if the column exists

### Common Edits:

**Change difficulty:**
```sql
UPDATE templates
SET difficulty = 'Advanced'
WHERE id = '<template-id>';
```

**Add tags:**
```sql
UPDATE templates
SET tags = ARRAY['gmail', 'discord', 'ai-agent', 'email']
WHERE id = '<template-id>';
```

**Update description:**
```sql
UPDATE templates
SET description = 'New improved description'
WHERE id = '<template-id>';
```

---

## Best Practices

### 1. Node Structure

Always include these fields in each node:

```json
{
  "id": "unique-node-id",
  "type": "custom",
  "position": { "x": 400, "y": 100 },
  "data": {
    "title": "Human-readable name",
    "description": "What this node does",
    "type": "actual_node_type",
    "providerId": "provider_name",
    "isTrigger": false,
    "config": {
      // Node-specific configuration
    }
  }
}
```

### 2. Connection Structure

```json
{
  "id": "unique-edge-id",
  "source": "source-node-id",
  "target": "target-node-id",
  "type": "smoothstep"
}
```

### 3. Node Positioning

- **Start at:** `x: 400, y: 100` for first node
- **Vertical spacing:** 160-200px between nodes
- **Horizontal spacing:** 400px for parallel branches
- **Keep it readable:** Don't overcrowd the canvas

### 4. Configuration Tips

✅ **DO:**
- Use clear, descriptive names
- Include helpful descriptions
- Set reasonable default configurations
- Test the template after creation
- Use consistent formatting
- Add all relevant tags

❌ **DON'T:**
- Leave sensitive data in configs (API keys, passwords)
- Use user-specific IDs (channel IDs, table IDs)
- Create templates that require too many configurations
- Forget to set `is_public` to true
- Use deprecated node types

### 5. Tags Best Practices

Good tags help users find templates:
- **Integration names:** `gmail`, `slack`, `airtable`
- **Use cases:** `lead-generation`, `customer-support`
- **Difficulty level:** Include difficulty as a tag too
- **Technology:** `ai-agent`, `webhook`, `scheduling`

Example:
```json
["gmail", "discord", "ai-agent", "email-routing", "intermediate"]
```

---

## Template Preview Requirements

For the preview to work correctly:

1. **Include position data** for all nodes
2. **Ensure all connections reference valid node IDs**
3. **Include `providerId`** for each node (for logo display)
4. **Set proper node types** so CustomNode can render them

---

## Troubleshooting

### Template Not Showing Up

**Check:**
- ✅ `is_public` is set to `true`
- ✅ `category` is one of the valid categories
- ✅ Template has valid `nodes` and `connections`
- ✅ No JSON syntax errors

### Preview Not Rendering

**Check:**
- ✅ All nodes have `position` data
- ✅ Connections reference valid node IDs
- ✅ Node types are valid (check `/lib/workflows/nodes`)
- ✅ Browser console for errors

### Template Fails to Copy

**Check:**
- ✅ `nodes` and `connections` are valid JSON
- ✅ All referenced node types exist in the system
- ✅ No circular dependencies in connections
- ✅ Check `/api/templates/[id]/copy` endpoint logs

---

## Example: Complete Template JSON

Here's a complete example of a simple template:

```json
{
  "name": "Gmail to Discord Alert",
  "description": "Send Discord notification when important email arrives",
  "category": "Notifications",
  "tags": ["gmail", "discord", "notifications", "beginner"],
  "difficulty": "Beginner",
  "estimatedTime": "5 min",
  "integrations": ["gmail", "discord"],
  "is_public": true,
  "is_predefined": true,
  "nodes": [
    {
      "id": "trigger-1",
      "type": "custom",
      "position": { "x": 400, "y": 100 },
      "data": {
        "title": "New Email",
        "description": "Triggers when new email arrives",
        "type": "gmail_trigger_new_email",
        "providerId": "gmail",
        "isTrigger": true,
        "config": {
          "labelIds": ["INBOX"]
        }
      }
    },
    {
      "id": "action-1",
      "type": "custom",
      "position": { "x": 400, "y": 280 },
      "data": {
        "title": "Send Discord Message",
        "description": "Send notification to Discord",
        "type": "discord_send_message",
        "providerId": "discord",
        "config": {
          "message": "New email from {{trigger.from}}: {{trigger.subject}}"
        }
      }
    }
  ],
  "connections": [
    {
      "id": "edge-1",
      "source": "trigger-1",
      "target": "action-1",
      "type": "smoothstep"
    }
  ]
}
```

---

## Validation Checklist

Before publishing a template, verify:

- [ ] All required fields are filled
- [ ] Category is valid
- [ ] Tags are relevant and helpful
- [ ] Nodes have valid types and configurations
- [ ] Connections link valid node IDs
- [ ] Preview renders correctly in UI
- [ ] Template can be copied successfully
- [ ] No sensitive data in configurations
- [ ] Description is clear and helpful
- [ ] Difficulty level is accurate
- [ ] Estimated time is realistic
- [ ] Tested end-to-end flow

---

## Advanced: Bulk Import Templates

If you need to import many templates:

### Using SQL
```sql
INSERT INTO templates (
  name, description, category, tags,
  nodes, connections, is_public, is_predefined,
  created_by, difficulty, estimatedTime
)
VALUES
  ('Template 1', 'Description 1', 'Productivity', ARRAY['tag1', 'tag2'],
   '[...]'::jsonb, '[...]'::jsonb, true, true,
   '<uuid>', 'Beginner', '5 min'),
  ('Template 2', 'Description 2', 'Sales & CRM', ARRAY['tag3'],
   '[...]'::jsonb, '[...]'::jsonb, true, true,
   '<uuid>', 'Intermediate', '10 min');
```

### Using API Script
```javascript
const templates = [/* array of template objects */]

for (const template of templates) {
  await fetch('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template)
  })
}
```

---

## Maintenance

### Regular Tasks:

1. **Review templates monthly** - ensure they still work
2. **Update descriptions** - keep them accurate
3. **Check for deprecated nodes** - update to new types
4. **Monitor usage** - see which templates are popular
5. **Get user feedback** - improve based on feedback

---

## Security Considerations

🔒 **Never include in templates:**
- API keys
- Access tokens
- Passwords
- User-specific IDs (unless generic)
- Email addresses
- Phone numbers
- Personal data

✅ **Safe to include:**
- Generic configurations
- Example data structures
- Placeholder text
- Public channel IDs (if necessary)
- Documentation references

---

## Support Resources

- **Template API:** `/app/api/templates/`
- **Template Gallery Component:** `/components/templates/TemplateGallery.tsx`
- **Node Definitions:** `/lib/workflows/nodes/`
- **Supabase Dashboard:** https://supabase.com/dashboard

---

## Questions?

Common questions:

**Q: Can users create their own templates?**
A: Yes, set `is_predefined: false` and `is_public: true` for user templates.

**Q: How do I make a template private?**
A: Set `is_public: false` - only the creator can see it.

**Q: Can I version templates?**
A: Not directly, but you can create a new template with a version suffix in the name.

**Q: How do I delete a template?**
A: Delete the row from the templates table in Supabase (or use API if implemented).

**Q: Can I export a workflow as a template?**
A: Yes, use the admin edit feature or manually copy the workflow data.
