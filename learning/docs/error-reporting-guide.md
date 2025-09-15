# Error Reporting and Support Ticket Integration Guide

## Overview

ChainReact now includes a comprehensive error reporting system that automatically creates support tickets when errors occur in the application. This system helps users report issues easily and helps the support team track and resolve problems quickly.

## Components

### 1. Error Reporting Utility (`/lib/utils/errorReporting.ts`)

The main error reporting service that:
- Captures and logs errors
- Shows toast notifications with "Report Issue" buttons
- Creates support tickets automatically
- Prevents duplicate reports for the same error
- Includes full browser/system information

### 2. Error Boundary Component (`/components/ErrorBoundary.tsx`)

A React error boundary that:
- Catches unhandled errors in component trees
- Displays a user-friendly error page
- Offers options to refresh, report issue, or try again
- Shows error details in development mode

### 3. Global Integration (`/components/layout/AppLayout.tsx`)

The error boundary is integrated into AppLayout, wrapping all page content to catch errors globally.

## Usage Examples

### 1. Manual Error Reporting in Try-Catch Blocks

```typescript
import { reportError } from '@/lib/utils/errorReporting'

async function executeWorkflow(workflowId: string) {
  try {
    // Your workflow execution code
    const result = await runWorkflow(workflowId)
    return result
  } catch (error) {
    // Report the error with context
    await reportError(error, {
      context: 'Workflow Execution',
      workflowId: workflowId,
      showToast: true,  // Shows toast with "Report Issue" button
      autoReport: false  // Don't auto-create ticket, let user decide
    })
    
    // Re-throw or handle as needed
    throw error
  }
}
```

### 2. Auto-Reporting Critical Errors

```typescript
import { reportError } from '@/lib/utils/errorReporting'

async function criticalOperation() {
  try {
    // Critical operation
  } catch (error) {
    // Auto-report critical errors
    await reportError(error, {
      context: 'Critical Operation Failed',
      autoReport: true,  // Automatically creates support ticket
      showToast: true
    })
  }
}
```

### 3. Integration with API Routes

```typescript
// In an API route handler
import { reportError } from '@/lib/utils/errorReporting'

export async function POST(request: Request) {
  try {
    // API logic
  } catch (error) {
    // Report server-side errors
    await reportError(error, {
      context: 'API Route: /api/workflows/execute',
      autoReport: true
    })
    
    return NextResponse.json(
      { error: 'An error occurred. Support has been notified.' },
      { status: 500 }
    )
  }
}
```

### 4. Using Error Boundary for Specific Components

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary'

export function RiskyComponent() {
  return (
    <ErrorBoundary context="Risky Component">
      <div>
        {/* Component that might throw errors */}
      </div>
    </ErrorBoundary>
  )
}
```

## Features

### Automatic Browser/System Info Collection

When an error is reported, the system automatically collects:
- Browser name and version
- Operating system
- Screen resolution
- Language preference
- Timezone
- Current URL
- Stack trace (if available)

### Duplicate Prevention

The system prevents duplicate tickets for the same error:
- Tracks errors by unique key (error type + message + context)
- Won't create duplicate tickets within 5 minutes
- Shows occurrence count in toast messages

### Priority Assignment

Errors are automatically assigned priority based on type:
- **Urgent**: Security errors, authentication failures
- **High**: Workflow or integration errors
- **Medium**: Network errors, general errors

### Toast Notifications

Users see toast notifications with:
- Error message
- Context information
- "Report Issue" button (unless auto-reported)
- Duration of 8 seconds for visibility

## Support Ticket Creation

### Manual Ticket Creation

Users can still manually create tickets through `/support` with:
- Subject and description fields
- Category selection (Bug, Feature Request, etc.)
- Priority selection
- Advanced options for bug reports:
  - Steps to reproduce
  - Expected vs actual behavior
  - Affected workflow/integration
- Auto-populated browser/system info

### Auto-Generated Tickets

Auto-reported errors create tickets with:
- `[Auto-Reported]` prefix in subject
- Full error details in description
- Stack trace in code blocks
- Browser/system information
- Timestamp and URL

## Best Practices

1. **Always provide context** when reporting errors:
   ```typescript
   reportError(error, { context: 'Specific Operation Name' })
   ```

2. **Include relevant IDs** for debugging:
   ```typescript
   reportError(error, {
     context: 'Workflow Execution',
     workflowId: workflow.id,
     integrationId: integration.id
   })
   ```

3. **Use auto-report sparingly** - only for critical errors that need immediate attention

4. **Handle errors gracefully** - report them but also provide fallback behavior

5. **Test error scenarios** during development to ensure proper reporting

## Implementation Checklist

When implementing error handling in new features:

- [ ] Wrap risky operations in try-catch blocks
- [ ] Call `reportError` with appropriate context
- [ ] Decide if error should be auto-reported or user-initiated
- [ ] Test error scenarios to verify reporting works
- [ ] Check that browser/system info is captured correctly
- [ ] Verify tickets appear in support page
- [ ] Ensure no duplicate tickets for same error

## Support Page Integration

The support page (`/app/support/page.tsx`) has been enhanced with:
- Display of auto-reported tickets
- Advanced ticket creation options
- Browser/system info auto-population
- Conditional field visibility based on category
- "Show advanced options" button (only when relevant)

## Future Enhancements

Potential improvements to consider:
- Error grouping and analytics
- Webhook notifications for critical errors
- Integration with external error tracking services
- Rate limiting for error reports
- Error recovery suggestions based on error type