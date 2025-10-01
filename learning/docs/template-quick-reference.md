# Template Management Quick Reference

Quick lookup guide for creating and managing workflow templates.

---

## Required Fields

```json
{
  "name": "Template Name",
  "description": "What this template does",
  "category": "Category Name",
  "nodes": [...],
  "connections": [...],
  "is_public": true,
  "is_predefined": true,
  "created_by": "user-uuid"
}
```

---

## Valid Categories

```
AI Agent Testing
Customer Service
Sales & CRM
Social Media
Productivity
Data Sync
E-commerce
Notifications
HR
DevOps
Marketing
Finance
```

---

## Optional Fields

```json
{
  "tags": ["tag1", "tag2", "tag3"],
  "difficulty": "Beginner|Intermediate|Advanced",
  "estimatedTime": "5 min",
  "integrations": ["gmail", "slack", "airtable"]
}
```

---

## Node Template

```json
{
  "id": "node-1",
  "type": "custom",
  "position": { "x": 400, "y": 100 },
  "data": {
    "title": "Node Title",
    "description": "What this node does",
    "type": "actual_node_type",
    "providerId": "provider",
    "isTrigger": false,
    "config": {}
  }
}
```

---

## Connection Template

```json
{
  "id": "edge-1",
  "source": "source-node-id",
  "target": "target-node-id",
  "type": "smoothstep"
}
```

---

## Common Node Types

### Triggers
- `gmail_trigger_new_email`
- `discord_trigger_new_message`
- `airtable_trigger_new_record`
- `manual_trigger`
- `schedule_trigger`
- `webhook_trigger`

### Actions
- `gmail_send_email`
- `discord_send_message`
- `slack_send_message`
- `airtable_create_record`
- `airtable_update_record`
- `ai_agent`
- `http_request`

### Logic
- `if_condition`
- `switch_case`
- `delay`
- `loop`

---

## Common Provider IDs

```
ai, gmail, slack, discord, airtable, notion,
stripe, shopify, hubspot, trello, asana,
google-drive, onedrive, dropbox, calendar
```

---

## Node Positioning Guide

```
First node:       x: 400, y: 100
Vertical spacing: 160-200px
Branch spacing:   400px horizontal
```

Example:
```
Trigger:   x: 400, y: 100
Action 1:  x: 400, y: 280
Action 2:  x: 400, y: 460
Branch A:  x: 200, y: 280
Branch B:  x: 600, y: 280
```

---

## SQL Quick Commands

### Create Template
```sql
INSERT INTO templates (
  name, description, category, tags,
  nodes, connections, is_public, is_predefined, created_by
) VALUES (
  'Template Name',
  'Description',
  'Productivity',
  ARRAY['tag1', 'tag2'],
  '[...]'::jsonb,
  '[...]'::jsonb,
  true,
  true,
  'user-uuid'
);
```

### Update Template
```sql
UPDATE templates
SET
  description = 'New description',
  difficulty = 'Advanced',
  tags = ARRAY['new', 'tags']
WHERE id = 'template-uuid';
```

### Delete Template
```sql
DELETE FROM templates
WHERE id = 'template-uuid';
```

### Find Template by Name
```sql
SELECT * FROM templates
WHERE name ILIKE '%search term%';
```

---

## Common Tags by Category

**Productivity:**
`automation, scheduling, tasks, notifications`

**Sales & CRM:**
`leads, sales-automation, crm, follow-up`

**Customer Service:**
`support, tickets, chat, email-routing`

**Social Media:**
`posting, monitoring, engagement, analytics`

**AI Agent:**
`ai-agent, classification, analysis, generation`

---

## Validation Checklist

Quick pre-publish checks:

- [ ] Valid category
- [ ] Clear description
- [ ] Accurate tags
- [ ] Valid JSON in nodes/connections
- [ ] All node IDs unique
- [ ] Connections reference valid nodes
- [ ] No sensitive data
- [ ] Preview renders correctly
- [ ] Template copies successfully

---

## Common Mistakes to Avoid

❌ Wrong category name (typo)
❌ Invalid node types
❌ Broken connection references
❌ Missing position data
❌ JSON syntax errors
❌ Sensitive data in configs
❌ User-specific IDs hardcoded

---

## Template Difficulty Guidelines

**Beginner (5-10 min):**
- 2-4 nodes
- 1 trigger, 1-3 actions
- Minimal configuration
- Example: Gmail → Discord notification

**Intermediate (10-20 min):**
- 4-8 nodes
- Conditional logic
- Multiple integrations
- Example: Email triage with AI classification

**Advanced (20+ min):**
- 8+ nodes
- Complex branching
- Multiple AI agents or loops
- Example: Multi-step customer onboarding

---

## Estimated Time Guidelines

**5 min:**
Simple trigger → action (1-2 config fields)

**10 min:**
Trigger → logic → action (3-5 config fields)

**15 min:**
Multiple branches, 4-6 nodes

**20-30 min:**
Complex workflows, 8+ nodes, multiple integrations

**30+ min:**
Advanced workflows with extensive configuration

---

## Testing Checklist

- [ ] Copy template from gallery
- [ ] All nodes render correctly
- [ ] No validation errors
- [ ] Can configure all required fields
- [ ] Can save workflow
- [ ] Can activate workflow
- [ ] Preview shows correctly
- [ ] Description is accurate

---

## File Locations

**API Routes:**
- `/app/api/templates/route.ts` - List/Create templates
- `/app/api/templates/[id]/route.ts` - Get/Update template
- `/app/api/templates/[id]/copy/route.ts` - Copy template
- `/app/api/templates/predefined/route.ts` - Official templates

**Components:**
- `/components/templates/TemplateGallery.tsx` - Gallery display
- `/components/templates/TemplatePreview.tsx` - Preview component

**Docs:**
- `/learning/docs/template-management-supabase-guide.md` - Full guide
- `/learning/docs/template-quick-reference.md` - This file
