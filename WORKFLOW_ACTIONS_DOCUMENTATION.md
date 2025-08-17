# ChainReact Workflow Actions & AI Field Generation Guide

## Overview

This document provides comprehensive documentation of all workflow actions and triggers in ChainReact, with specific focus on AI-fillable fields and generation strategies.

## Email Actions

### Gmail Send Email (`gmail_action_send_email`)

**Purpose**: Send professional emails through Gmail with rich formatting and attachments

**Input Fields**:
- `to` (email-autocomplete, required): Recipient email addresses
- `cc` (email-autocomplete, optional): CC recipients 
- `bcc` (email-autocomplete, optional): BCC recipients
- `subject` (text, required): Email subject line
- `body` (email-rich-text, required): Email content with rich formatting
- `attachments` (file, optional): File attachments

**Output Schema**:
- `messageId`: Unique Gmail message identifier
- `threadId`: Gmail conversation thread ID
- `subject`: Subject line of sent email
- `to`: Recipients list
- `sentAt`: Timestamp when email was sent

**AI-Fillable Fields & Generation Strategy**:

```json
{
  "subject": {
    "generation": "contextual_summary",
    "template": "Re: {trigger_context} - {action_summary}",
    "max_length": 78,
    "style": "professional, concise"
  },
  "body": {
    "generation": "structured_email",
    "template": {
      "greeting": "Hi {recipient_name},",
      "opening": "Thank you for {trigger_context}. I wanted to follow up regarding {main_topic}.",
      "main_content": "{context_analysis_and_response}",
      "call_to_action": "{next_steps_if_applicable}",
      "closing": "Best regards,\n{user_signature}"
    },
    "style": "professional, helpful, actionable",
    "formatting": "html_with_paragraphs"
  }
}
```

### Outlook Send Email (`outlook_action_send_email`)

**Purpose**: Send emails through Microsoft Outlook/Exchange

**Input Fields**: Same as Gmail
**Output Schema**: Similar to Gmail with Microsoft-specific IDs
**AI Generation**: Same strategy as Gmail

### Resend Send Email (`resend_action_send_email`)

**Purpose**: Send transactional emails via Resend service

**Input Fields**: 
- `from` (email, required): Sender email address
- `to` (email, required): Recipient email
- `subject` (text, required): Email subject
- `html` (textarea, optional): HTML email content
- `text` (textarea, optional): Plain text content

**AI Generation Strategy**:
```json
{
  "subject": {
    "generation": "transactional_summary",
    "template": "{action_type}: {brief_description}",
    "style": "clear, direct, informative"
  },
  "html": {
    "generation": "transactional_email",
    "template": "<!DOCTYPE html><html><body><h2>{subject}</h2><p>{main_message}</p><hr><p>This email was sent by ChainReact automation.</p></body></html>",
    "style": "clean, professional, minimal"
  }
}
```

## Communication Actions

### Slack Send Message (`slack_action_send_message`)

**Purpose**: Send messages to Slack channels with rich formatting

**Input Fields**:
- `channel` (select, required): Target Slack channel
- `text` (textarea, required): Message content
- `username` (text, optional): Custom bot username
- `icon_emoji` (text, optional): Custom bot emoji
- `thread_ts` (text, optional): Thread timestamp for replies

**Output Schema**:
- `messageId`: Slack message identifier
- `channel`: Channel where message was sent
- `text`: Message content sent
- `timestamp`: When message was posted

**AI Generation Strategy**:
```json
{
  "text": {
    "generation": "slack_message",
    "template": "{greeting_emoji} {main_message}\n\n{context_details}\n\n{call_to_action_if_needed}",
    "style": "casual, friendly, emoji-appropriate",
    "formatting": "slack_markdown",
    "max_length": 4000
  },
  "username": {
    "generation": "bot_name",
    "template": "{workflow_name} Bot",
    "style": "descriptive, professional"
  }
}
```

### Discord Send Message (`discord_action_send_message`)

**Purpose**: Send messages to Discord channels with embed support

**Input Fields**:
- `channelId` (select, required): Target Discord channel
- `content` (discord-rich-text, required): Message content with Discord formatting
- `username` (text, optional): Webhook username
- `avatar_url` (text, optional): Custom avatar URL

**Output Schema**:
- `messageId`: Discord message ID
- `channelId`: Channel where sent
- `content`: Message content
- `timestamp`: Message timestamp

**AI Generation Strategy**:
```json
{
  "content": {
    "generation": "discord_message",
    "template": "**{title}**\n\n{main_content}\n\n{additional_info}",
    "style": "casual, engaging, community-friendly",
    "formatting": "discord_markdown",
    "max_length": 2000
  },
  "username": {
    "generation": "bot_name",
    "template": "{workflow_name} Assistant",
    "style": "friendly, approachable"
  }
}
```

## Social Media Actions

### Twitter/X Post (`twitter_action_post`)

**Purpose**: Post tweets with media and poll support

**Input Fields**:
- `text` (textarea, required): Tweet content
- `media` (file, optional): Image/video attachments
- `poll_options` (array, optional): Poll choices
- `poll_duration` (number, optional): Poll duration in minutes

**AI Generation Strategy**:
```json
{
  "text": {
    "generation": "twitter_post",
    "template": "{hook_or_emoji} {main_message} {hashtags}",
    "style": "engaging, conversational, hashtag-optimized",
    "max_length": 280,
    "formatting": "twitter_optimized"
  },
  "poll_options": {
    "generation": "poll_choices",
    "template": ["{option_1}", "{option_2}", "{option_3_if_applicable}"],
    "style": "clear, balanced, engaging"
  }
}
```

## Productivity Actions

### Notion Create Page (`notion_action_create_page`)

**Purpose**: Create new pages in Notion workspace

**Input Fields**:
- `parent` (select, required): Parent database or page
- `title` (text, required): Page title
- `content` (textarea, optional): Page content in Notion blocks

**Output Schema**:
- `pageId`: Notion page identifier
- `url`: Direct link to created page
- `title`: Page title

**AI Generation Strategy**:
```json
{
  "title": {
    "generation": "notion_title",
    "template": "{content_type}: {main_topic} - {date}",
    "style": "descriptive, organized, searchable"
  },
  "content": {
    "generation": "notion_content",
    "template": "# {title}\n\n## Summary\n{overview}\n\n## Details\n{main_content}\n\n## Next Steps\n{action_items}",
    "style": "structured, comprehensive, actionable",
    "formatting": "notion_markdown"
  }
}
```

### Trello Create Card (`trello_action_create_card`)

**Purpose**: Create cards in Trello boards

**Input Fields**:
- `list` (select, required): Target Trello list
- `name` (text, required): Card title
- `desc` (textarea, optional): Card description
- `due` (date, optional): Due date

**AI Generation Strategy**:
```json
{
  "name": {
    "generation": "trello_title",
    "template": "{action_verb}: {brief_description}",
    "style": "action-oriented, concise",
    "max_length": 256
  },
  "desc": {
    "generation": "trello_description",
    "template": "**Background:**\n{context}\n\n**Requirements:**\n{details}\n\n**Acceptance Criteria:**\n{criteria}",
    "style": "clear, actionable, detailed",
    "formatting": "markdown"
  }
}
```

### Airtable Create Record (`airtable_action_create_record`)

**Purpose**: Create records in Airtable bases

**Input Fields**:
- `base` (select, required): Target Airtable base
- `table` (select, required): Target table
- `fields` (dynamic, required): Field values based on table schema

**AI Generation Strategy**:
```json
{
  "dynamic_fields": {
    "text_fields": {
      "generation": "contextual_value",
      "template": "{field_appropriate_content}",
      "style": "data-appropriate, consistent"
    },
    "description_fields": {
      "generation": "structured_description",
      "template": "{summary} - Generated from {trigger_source}",
      "style": "informative, searchable"
    }
  }
}
```

## Developer Tools

### GitHub Create Issue (`github_action_create_issue`)

**Purpose**: Create issues in GitHub repositories

**Input Fields**:
- `repo` (select, required): Target repository
- `title` (text, required): Issue title
- `body` (textarea, optional): Issue description
- `labels` (multiselect, optional): Issue labels
- `assignees` (multiselect, optional): Assignees

**AI Generation Strategy**:
```json
{
  "title": {
    "generation": "github_issue_title",
    "template": "[{issue_type}] {brief_description}",
    "style": "clear, categorized, searchable"
  },
  "body": {
    "generation": "github_issue_body",
    "template": "## Description\n{problem_description}\n\n## Steps to Reproduce\n{steps_if_applicable}\n\n## Expected Behavior\n{expected_outcome}\n\n## Additional Context\n{context_details}",
    "style": "technical, structured, actionable",
    "formatting": "github_markdown"
  }
}
```

## E-commerce Actions

### Shopify Create Product (`shopify_action_create_product`)

**Purpose**: Create products in Shopify store

**Input Fields**:
- `title` (text, required): Product title
- `body_html` (textarea, optional): Product description
- `vendor` (text, optional): Product vendor
- `product_type` (text, optional): Product category
- `tags` (text, optional): Product tags

**AI Generation Strategy**:
```json
{
  "title": {
    "generation": "product_title",
    "template": "{descriptive_name} - {key_feature}",
    "style": "marketable, SEO-friendly, clear"
  },
  "body_html": {
    "generation": "product_description",
    "template": "<h3>Key Features</h3><ul><li>{feature_1}</li><li>{feature_2}</li></ul><h3>Description</h3><p>{detailed_description}</p><h3>Specifications</h3><p>{specifications}</p>",
    "style": "persuasive, informative, SEO-optimized",
    "formatting": "html"
  },
  "tags": {
    "generation": "product_tags",
    "template": "{category}, {features}, {use_cases}",
    "style": "searchable, relevant, comma-separated"
  }
}
```

## File Storage Actions

### Google Drive Upload File (`google_drive_action_upload_file`)

**Purpose**: Upload files to Google Drive

**Input Fields**:
- `name` (text, required): File name
- `parent` (select, optional): Parent folder
- `description` (text, optional): File description

**AI Generation Strategy**:
```json
{
  "name": {
    "generation": "file_name",
    "template": "{content_type}_{topic}_{timestamp}",
    "style": "descriptive, organized, searchable"
  },
  "description": {
    "generation": "file_description",
    "template": "{file_purpose} - Generated on {date} from {source}",
    "style": "informative, contextual"
  }
}
```

## AI Field Generation Implementation

### Core AI Generation Service

```typescript
interface AIFieldGenerationRequest {
  actionType: string;
  fieldName: string;
  context: WorkflowContext;
  triggerData: any;
  userPreferences?: UserPreferences;
}

interface AIFieldGenerationResponse {
  generatedContent: string;
  confidence: number;
  alternatives?: string[];
  reasoning: string;
}

class AIFieldGenerator {
  async generateField(request: AIFieldGenerationRequest): Promise<AIFieldGenerationResponse> {
    const template = this.getTemplateForField(request.actionType, request.fieldName);
    const prompt = this.buildPrompt(template, request.context, request.triggerData);
    
    return await this.callAI(prompt, template.constraints);
  }
  
  private getTemplateForField(actionType: string, fieldName: string) {
    // Return appropriate template from the strategies above
  }
  
  private buildPrompt(template: any, context: WorkflowContext, triggerData: any): string {
    return `
Generate ${template.generation} content for ${template.style} style.

Context: ${JSON.stringify(context)}
Trigger Data: ${JSON.stringify(triggerData)}

Template: ${template.template}
Max Length: ${template.max_length || 'no limit'}
Formatting: ${template.formatting || 'plain text'}

Generate appropriate content following the template structure.
`;
  }
}
```

### Integration with Existing Workflow System

The AI field generation can be integrated with the existing variable picker system by:

1. **Enhanced Variable Menu**: Add "AI Generate" options for compatible fields
2. **Context-Aware Generation**: Use workflow context and trigger data for relevant content
3. **Template Customization**: Allow users to customize AI generation templates
4. **Preview & Edit**: Show generated content with option to modify before using
5. **Learning System**: Improve generation based on user feedback and edits

This comprehensive system provides intelligent content generation while maintaining user control and customization capabilities.