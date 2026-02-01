# AI Template Caching System

## Overview

The AI Template Caching System automatically saves successful AI-generated workflow plans as reusable templates. This provides:

1. **Faster responses** - Repeated similar requests return instantly from cache
2. **Cost savings** - Avoids LLM API calls for previously seen prompts
3. **Template library growth** - Automatically builds a library of proven workflows

## Architecture

### Flow Diagram

```
User Prompt
    ↓
1. Generate prompt hash (normalized, SHA-256)
    ↓
2. Check templates table for matching hash
    ├── CACHE HIT → Convert template to PlannerResult, return immediately
    ↓
3. CACHE MISS → Run planner (LLM or pattern-based)
    ↓
4. On success → Save plan as new template
    ↓
5. Return PlannerResult to client
```

### Key Files

| File | Purpose |
|------|---------|
| `/lib/workflows/ai-agent/planToTemplate.ts` | Core conversion logic |
| `/app/api/templates/ai-generated/route.ts` | Dedicated API for AI templates |
| `/app/workflows/v2/api/flows/[flowId]/edits/route.ts` | Integrated cache check + save |
| `/supabase/migrations/20260129000000_add_ai_template_columns.sql` | Database schema |
| `/components/templates/TemplateGallery.tsx` | UI with AI badge |

## Database Schema

New columns added to `templates` table:

```sql
prompt_hash TEXT       -- SHA-256 hash (16 chars) of normalized prompt
is_ai_generated BOOLEAN DEFAULT FALSE
original_prompt TEXT   -- Original user request
integrations TEXT[]    -- Required integration providers
```

Indexes:
- `idx_templates_prompt_hash` - Fast lookup by hash
- `idx_templates_ai_generated` - Filter AI templates
- `idx_templates_integrations` - GIN index for integration filtering

## Prompt Normalization

Before hashing, prompts are normalized to increase cache hit rates:

```typescript
function generatePromptHash(prompt: string): string {
  const normalized = prompt
    .toLowerCase()           // Case insensitive
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .trim()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}
```

This means these prompts all match:
- "When I get an email, post to Slack"
- "when i get an email post to slack"
- "WHEN I GET AN EMAIL - POST TO SLACK!"

## Configuration Stripping

Templates don't save user-specific values. The system preserves:

### Preserved (AI-generated content):
- `message`, `content`, `body`, `text`
- `prompt`, `systemPrompt`, `userPrompt`
- `subject`, `title`, `name`
- Format settings (`targetFormat`, `method`)
- Template variables (`{{trigger.subject}}`)

### Stripped (user-specific):
- Connection IDs (`connectionId`, `integrationId`)
- Resource IDs (`channelId`, `databaseId`, `spreadsheetId`)
- API keys and tokens
- Email addresses (unless template variables)

## API Reference

### Check/Retrieve Template

```bash
GET /api/templates/ai-generated?promptHash=abc123
GET /api/templates/ai-generated?prompt=when%20email%20to%20slack
```

Response:
```json
{
  "found": true,
  "template": {
    "id": "uuid",
    "name": "Email to Slack Notification",
    "nodes": [...],
    "connections": [...],
    "integrations": ["gmail", "slack"]
  }
}
```

### Save Template

```bash
POST /api/templates/ai-generated
{
  "plannerResult": { "edits": [...], "workflowName": "..." },
  "originalPrompt": "when I get an email post to slack",
  "isPublic": false
}
```

### Edits API (Integrated)

The `/api/workflows/v2/flows/[flowId]/edits` endpoint now:

1. Checks template cache first (if `useTemplateCache: true`)
2. Returns cached template on hit
3. Saves successful plans (if `saveAsTemplate: true`)

New request options:
```json
{
  "prompt": "...",
  "flow": {...},
  "useTemplateCache": true,  // Default: true
  "saveAsTemplate": true     // Default: true
}
```

New response fields:
```json
{
  "ok": true,
  "fromCache": true,           // Was this from cache?
  "cachedTemplateId": "uuid"   // ID if from cache
}
```

## UI Integration

### Template Gallery

The `/templates` page shows AI-generated templates with:

1. **"AI Generated" badge** - Purple gradient badge
2. **Filter toggle** - Click to show/hide AI templates
3. **Author text** - Shows "AI Generated" instead of "by ChainReact"

### Preview

AI-generated templates can be:
- Previewed in the modal
- Copied to create new workflows
- Edited by admins

## Admin Workflow

AI-generated templates start as:
- `is_public: false`
- `status: 'draft'`

Admins can:
1. Review AI-generated templates in admin scope
2. Edit/improve the template
3. Publish (`is_public: true`, `status: 'published'`)
4. Feature in the gallery

## Best Practices

### When to Disable Caching

```typescript
// Disable for unique/specific requests
fetch('/api/workflows/v2/flows/.../edits', {
  body: JSON.stringify({
    prompt: "very specific custom workflow",
    useTemplateCache: false,  // Skip cache
    saveAsTemplate: false     // Don't pollute cache
  })
})
```

### Monitoring

Check logs for cache performance:
```
[API /edits] Template cache HIT  { templateId, duration }
[API /edits] Template cache MISS { promptHash }
[API /edits] Saved plan as template { templateId, promptHash }
```

## Migration

Run the migration to add new columns:

```bash
supabase db push --db-url "$POSTGRES_URL_NON_POOLING"
```

Or apply manually:
```sql
-- See: supabase/migrations/20260129000000_add_ai_template_columns.sql
```

## Unsupported Feature Detection

The planner automatically detects when users request features or integrations that aren't currently supported and provides helpful guidance.

### Detected Unsupported Features

The system detects:

**Unsupported Integrations:**
- LinkedIn, Salesforce, Jira, Asana, Zendesk
- Zoom, Calendly, Twilio/SMS, WhatsApp, Telegram
- QuickBooks, Xero, Intercom, Pipedrive, ClickUp

**Unsupported Features:**
- RSS feed triggers
- Built-in scheduled triggers (cron jobs)
- FTP/SFTP file transfers
- Direct database connections
- Web scraping (beyond basic extraction)

### How It Works

1. User submits a prompt
2. Planner detects unsupported patterns via regex
3. If found, returns `unsupportedFeatures` object in response:

```typescript
{
  hasUnsupported: true,
  features: [
    {
      feature: "LinkedIn integration",
      alternative: "Use HTTP Request node to call LinkedIn API directly..."
    }
  ],
  message: "I noticed your request includes LinkedIn integration..."
}
```

4. UI displays a warning message with amber styling
5. Planner still attempts to create a workflow with available integrations

### Adding New Unsupported Features

Edit `/src/lib/workflows/builder/agent/planner.ts`:

```typescript
const UNSUPPORTED_FEATURES: UnsupportedFeature[] = [
  {
    patterns: [/\b(newservice)\b/i],
    feature: 'NewService integration',
    alternative: 'Consider using HTTP Request node or an alternative integration.',
  },
  // ... add more
]
```

### Supported Integrations Reference

Currently supported providers:
- **Email:** Gmail, Outlook
- **Messaging:** Slack, Discord, Teams
- **Productivity:** Notion, Airtable, Trello, Monday
- **Storage:** Google Drive, Dropbox, OneDrive
- **CRM:** HubSpot
- **Ecommerce:** Stripe, Shopify, Gumroad
- **Developer:** GitHub
- **Social:** Twitter, Facebook
- **Other:** Mailchimp, ManyChat, Google Calendar, Google Sheets
