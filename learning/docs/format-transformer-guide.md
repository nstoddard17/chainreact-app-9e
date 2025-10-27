# Format Transformer Guide

## Overview

The **Format Transformer** is a utility node that converts content between different formats, solving the common problem of sending rich content (like HTML emails) to messaging platforms (like Slack) that use different formatting systems.

## Why It Exists

**The Problem**: When you build workflows like "When I get an email → send to Slack," the email body is typically HTML, but Slack uses its own markdown format. Sending raw HTML to Slack results in ugly, unreadable messages with visible tags.

**The Solution**: The Format Transformer automatically detects and converts content between formats:
- **HTML** → Slack Markdown (most common)
- **HTML** → Plain Text
- **Markdown** → Slack Markdown
- **Plain Text** → HTML
- And more...

## Node Location

- **Type**: `format_transformer`
- **Category**: Data Transformation
- **Provider**: `utility`
- **Icon**: ArrowLeftRight (↔️)

## Configuration Fields

### Required Fields

1. **Content to Transform** (`content`)
   - The content you want to convert
   - Supports variable references like `{{gmailTrigger.body}}`
   - Can be any text, HTML, or markdown

2. **Target Format** (`targetFormat`)
   - **Slack Markdown** (`slack_markdown`) - Default, most common
   - **Plain Text** (`plain`) - Strips all formatting
   - **HTML** (`html`) - Converts to HTML
   - **Standard Markdown** (`markdown`) - Generic markdown format

### Optional Fields

3. **Source Format** (`sourceFormat`)
   - **Auto-detect** (`auto`) - Default, automatically identifies the format
   - **HTML** (`html`) - Explicitly mark as HTML
   - **Markdown** (`markdown`) - Explicitly mark as Markdown
   - **Plain Text** (`plain`) - Explicitly mark as plain text

4. **Preserve Workflow Variables** (`preserveVariables`)
   - Default: `true`
   - Keeps `{{variable}}` placeholders intact during transformation
   - Set to `false` only if you want to transform variable syntax

## Output Schema

The Format Transformer produces the following outputs:

```typescript
{
  transformedContent: string      // The converted content
  originalFormat: string          // Detected or specified format
  targetFormat: string           // Format it was converted to
  success: boolean               // Whether transformation succeeded
}
```

## Example Usage

### Example 1: Gmail → Slack (Auto-inserted by AI Agent)

```typescript
// Workflow: "When I get an email, send it to Slack"

// Node 1: Gmail Trigger
Output: { body: "<p>Hello <strong>World</strong>!</p>" }

// Node 2: Format Transformer (Auto-inserted)
Config: {
  content: "{{gmailTrigger.body}}",
  sourceFormat: "auto",  // Will detect HTML
  targetFormat: "slack_markdown"
}
Output: {
  transformedContent: "Hello *World*!",
  originalFormat: "html",
  targetFormat: "slack_markdown"
}

// Node 3: Slack Send Message
Config: {
  channel: "#general",
  message: "{{formatTransformer.transformedContent}}"
}
```

### Example 2: Explicit Transformation

```typescript
// Manually configure the transformer

// Node: Format Transformer
Config: {
  content: "{{trigger.emailBody}}",
  sourceFormat: "html",           // Explicitly set
  targetFormat: "plain"            // Convert to plain text
}
Output: {
  transformedContent: "Hello World!",  // All HTML tags removed
  originalFormat: "html",
  targetFormat: "plain",
  success: true
}
```

## Auto-Insertion by AI Agent

When the AI workflow builder detects certain patterns, it will automatically insert a Format Transformer node:

### Trigger Patterns

The transformer is auto-inserted when:

1. **Cross-Channel Formatting** is detected:
   - Gmail/Outlook → Slack/Discord/Teams
   - Any HTML source → Messaging platform

2. **User mentions formatting** in their request:
   - "convert the email to Slack format"
   - "make sure the message is readable in Discord"
   - "format the content for Teams"

### AI Agent Behavior

When auto-inserting the transformer, the AI agent:

1. **Places it between the source and destination**:
   ```
   Gmail Trigger → Format Transformer → Slack Send Message
   ```

2. **Configures it automatically**:
   - `content`: Points to the rich content field (e.g., `{{gmailTrigger.body}}`)
   - `targetFormat`: Set based on destination (e.g., `slack_markdown` for Slack)
   - `sourceFormat`: Usually `auto` to detect the format

3. **Adds an explanatory note**:
   ```typescript
   note: "I added a transformer to format the email body before it reaches Slack—delete it if you prefer the raw HTML."
   ```

4. **Mentions it in the summary**:
   ```
   "I added a Format Transformer between Gmail and Slack to convert the HTML email body
   into Slack's markdown format. You can delete this node if you prefer to see the raw HTML."
   ```

## Node Notes Feature

The Format Transformer leverages the new **node notes** feature to provide context:

### What Are Node Notes?

- Optional explanatory text on any node
- Displayed with an Info icon (ℹ️) in a blue info box
- Useful for AI-inserted nodes to explain their purpose
- Can be added to any node type

### Example Note Display

```
┌─────────────────────────────────────────────┐
│ ℹ️ I added this transformer to convert     │
│    the HTML email body to Slack-friendly   │
│    formatting. Delete if you prefer raw HTML│
└─────────────────────────────────────────────┘
```

### Adding Notes Programmatically

When creating nodes, add the `note` field:

```typescript
const transformerNode = {
  id: 'transformer-123',
  type: 'custom',
  data: {
    type: 'format_transformer',
    title: 'Format Transformer',
    description: 'Convert HTML to Slack markdown',
    config: {
      content: '{{gmailTrigger.body}}',
      targetFormat: 'slack_markdown'
    },
    note: 'I added this to format the email body before sending to Slack—delete it if you prefer the raw HTML.'
  }
}
```

## Transformation Details

### HTML → Slack Markdown

The transformer uses Turndown.js with Slack-specific rules:

- `**bold**` → `*bold*`
- `*italic*` → `_italic_`
- `~~strikethrough~~` → `~strikethrough~`
- `[link](url)` → `<url|link>`
- Headers converted to bold text
- Lists preserved
- Code blocks preserved with triple backticks

### Variable Preservation

By default, workflow variables are preserved:

```
Input:  "<p>Hello {{user.name}}!</p>"
Output: "Hello {{user.name}}!"
```

This ensures variables resolve correctly at runtime.

## Common Use Cases

### 1. Email to Messaging
**Pattern**: Email trigger → Transformer → Messaging action

**Why**: Email bodies are HTML, messaging platforms use markdown or plain text

**Example Workflows**:
- Gmail → Slack: Convert email to Slack markdown
- Outlook → Teams: Convert email to Teams format
- Gmail → Discord: Convert email to Discord markdown

### 2. CMS to Plain Text
**Pattern**: CMS trigger → Transformer → Plain text action

**Why**: CMS content is often HTML or rich text, but you need plain text

**Example Workflows**:
- Notion → SMS: Extract plain text from Notion blocks
- WordPress → Twitter: Remove HTML formatting for tweets

### 3. Markdown to HTML
**Pattern**: Markdown source → Transformer → HTML destination

**Why**: Some APIs require HTML input

**Example Workflows**:
- GitHub Issue → Email: Convert markdown to HTML email
- Slack Message → Document: Convert Slack markdown to HTML

## Best Practices

### 1. Let Auto-Detection Work

Use `sourceFormat: "auto"` unless you have a specific reason:

```typescript
✅ Good:
{
  sourceFormat: "auto",
  targetFormat: "slack_markdown"
}

❌ Unnecessary:
{
  sourceFormat: "html",  // Auto-detect handles this
  targetFormat: "slack_markdown"
}
```

### 2. Choose the Right Target Format

Match the target format to the destination:

| Destination | Target Format |
|-------------|---------------|
| Slack | `slack_markdown` |
| Discord | `slack_markdown` (similar format) |
| Teams | `slack_markdown` |
| SMS/Plain Text | `plain` |
| Email | `html` |
| Generic Markdown | `markdown` |

### 3. Test with Real Data

Always test your transformation with actual data:

1. Use the "Test Node" feature
2. Check the output in the node's test results
3. Verify the formatting in the destination app

### 4. Consider Removing for Simple Cases

The transformer adds processing overhead. Remove it when:
- Both source and destination use the same format
- You actually want the raw HTML (rare)
- The destination handles HTML well natively

## Troubleshooting

### Issue: Transformer Not Converting

**Symptoms**: Output looks the same as input

**Possible Causes**:
1. Source format not detected correctly
2. Target format same as source format

**Solution**:
```typescript
// Explicitly set source format
{
  content: "{{trigger.body}}",
  sourceFormat: "html",  // Force HTML detection
  targetFormat: "slack_markdown"
}
```

### Issue: Variables Not Resolving

**Symptoms**: `{{variable}}` appears literally in output

**Possible Causes**:
1. Variable reference is incorrect
2. Variable not available at this point in workflow

**Solution**:
- Check variable name matches exactly
- Verify the source node has executed before the transformer
- Use Variable Picker to select the correct field

### Issue: Formatting Lost

**Symptoms**: Output is plain text with no formatting

**Possible Causes**:
1. Target format set to `plain`
2. Source content is already plain text

**Solution**:
- Change `targetFormat` to `slack_markdown` or `html`
- Check the source content actually contains formatting

## Implementation Files

### Core Files

1. **Node Definition**:
   - `/lib/workflows/nodes/providers/utility/index.ts` (lines 13-99)
   - Defines the Format Transformer node schema

2. **Action Handler**:
   - `/lib/workflows/actions/utility/formatTransformer.ts`
   - Implements the transformation logic

3. **Action Registry**:
   - `/lib/workflows/actions/registry.ts` (lines 643-646)
   - Registers the transformer action

4. **Rich Text Formatter** (Reused):
   - `/lib/workflows/formatters/richText.ts`
   - Shared HTML → Slack markdown conversion logic

### UI Files

5. **CustomNode Component**:
   - `/components/workflows/CustomNode.tsx`
   - Displays node notes with Info icon

6. **Node Data Interface**:
   - `/components/workflows/CustomNode.tsx` (line 38)
   - Added `note?: string` field to node data

## Future Enhancements

Potential improvements for the Format Transformer:

1. **More Target Formats**:
   - Microsoft Word format
   - PDF formatting
   - JSON to formatted text

2. **Advanced Options**:
   - Custom transformation rules
   - Preserve specific HTML tags
   - Custom variable syntax

3. **Preview Mode**:
   - Live preview of transformation
   - Side-by-side before/after view
   - Sample data injection

4. **Template Support**:
   - Save common transformation patterns
   - Preset configurations for popular workflows
   - Community-shared transformers

## Related Documentation

- [Workflow Execution Implementation Guide](/learning/docs/workflow-execution-implementation-guide.md)
- [Action/Trigger Implementation Guide](/learning/docs/action-trigger-implementation-guide.md)
- [Slack Send Message (uses rich text formatter)](/lib/workflows/actions/slack/sendMessage.ts)
- [Workflow Builder Improvements](/docs/workflow-builder-improvements.md)
