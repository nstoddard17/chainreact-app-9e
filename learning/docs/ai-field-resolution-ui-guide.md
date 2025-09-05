# AI Field Resolution UI Guide

## Overview
This guide explains where users can view AI field resolution details in the ChainReact UI. When workflows run with AI-generated field values, the system tracks what the AI chose for each field and makes this information accessible through multiple UI locations.

## Where to View AI Field Resolutions

### 1. **Workflow Execution History** (Primary Location)
**Path:** Workflows → [Select a Workflow] → Execution History

The WorkflowExecutions component displays a list of all workflow runs. For each execution:
- **Quick Summary**: Below each execution entry, you'll see a summary showing:
  - Number of AI fields resolved (e.g., "5 AI fields")
  - Total tokens used
  - Total cost
- **Eye Icon Button**: Click to open the Execution Details Modal

### 2. **Execution Details Modal** (Detailed View)
**Access:** Click the Eye icon (👁️) on any execution in the history list

The modal contains four tabs:
1. **Overview Tab**: General execution information (status, timing, errors)
2. **AI Fields Tab** ⭐: Complete AI field resolution details
3. **Input Data Tab**: The trigger data that started the workflow
4. **Output Data Tab**: Results from each action

#### AI Fields Tab Features:
- **Grouped by Node**: Resolutions are organized by workflow node
- **Expandable Sections**: Click on each node to see its fields
- **For Each Field Shows**:
  - Field name and type (dropdown, text, etc.)
  - Original placeholder (e.g., `{{AI_FIELD:channel}}`)
  - **AI Selected Value** (highlighted in green)
  - Available options (for dropdowns)
  - AI's reasoning for the selection
  - Token usage and cost
- **Summary Metrics**: Total tokens and cost at the top

### 3. **Integration into Existing UI Components**

#### WorkflowExecutions Component (`/components/workflows/WorkflowExecutions.tsx`)
- Added `AIFieldResolutionSummary` component to each execution row
- Added click handler to Eye button to open details modal
- Imported `ExecutionDetailsModal` component

#### ExecutionDetailsModal Component (`/components/workflows/ExecutionDetailsModal.tsx`)
- New modal component with tabbed interface
- Integrates `AIFieldResolutionDisplay` component in AI Fields tab
- Fetches execution details from API

#### AIFieldResolutionDisplay Component (`/components/workflows/AIFieldResolutionDisplay.tsx`)
- Main component for displaying AI field resolutions
- Fetches data from `/api/workflows/executions/[executionId]/ai-resolutions`
- Provides expandable, organized view of all AI decisions

## API Endpoints

### Get AI Field Resolutions
```
GET /api/workflows/executions/[executionId]/ai-resolutions
```

Returns:
```json
{
  "success": true,
  "executionId": "exec-123",
  "resolutions": [
    {
      "nodeId": "action-1",
      "nodeType": "slack_action_send_message",
      "nodeLabel": "Slack: Send Message",
      "fields": [
        {
          "fieldName": "channel",
          "fieldType": "select",
          "originalValue": "{{AI_FIELD:channel}}",
          "resolvedValue": "#urgent-alerts",
          "availableOptions": { "options": ["#general", "#urgent-alerts"] },
          "reasoning": "Selected urgent channel due to URGENT in subject",
          "tokensUsed": 45,
          "cost": 0.0023
        }
      ]
    }
  ],
  "totalResolutions": 5,
  "totalCost": 0.0156,
  "totalTokens": 312
}
```

## Database Storage

### Table: `ai_field_resolutions`
Stores detailed information about each AI field resolution:
- Links to execution and workflow
- Field metadata and constraints
- AI's selected/generated value
- Available options for dropdowns
- Context used for decision
- AI's reasoning
- Cost and token metrics

### View: `ai_field_resolutions_detailed`
Joins resolution data with workflow and execution information for easier querying.

## User Benefits

1. **Transparency**: See exactly what AI chose and why
2. **Debugging**: Understand workflow behavior when issues occur
3. **Cost Tracking**: Monitor AI usage costs per execution
4. **Optimization**: Identify patterns to improve prompts or constraints
5. **Compliance**: Audit trail of all AI decisions

## How to Add to Other Workflow Views

To add AI field resolution display to other parts of the app:

```tsx
import { AIFieldResolutionDisplay } from '@/components/workflows/AIFieldResolutionDisplay'

// In your component
<AIFieldResolutionDisplay 
  executionId={executionId}
  className="mt-4"
/>
```

Or for a summary:

```tsx
import { AIFieldResolutionSummary } from '@/components/workflows/AIFieldResolutionDisplay'

// Shows compact metrics
<AIFieldResolutionSummary 
  executionId={executionId}
  className="text-sm"
/>
```

## Testing the Feature

1. Create a workflow with AI fields (fields set to "Defined automatically by the model")
2. Run the workflow
3. Navigate to the workflow's execution history
4. Look for the AI field summary below each execution
5. Click the Eye icon to see detailed resolutions
6. Navigate to the "AI Fields" tab in the modal

## Future Enhancements

Potential improvements to consider:
- Real-time display during workflow execution
- Comparison view between multiple executions
- Export AI resolution data to CSV/JSON
- Analytics dashboard for AI field performance
- Suggestions for optimizing field constraints based on patterns