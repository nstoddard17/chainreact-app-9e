---
title: "Workflow Test Configuration"
date: "2023-07-26"
component: "ConfigurationModal"
---

# Workflow Test Configuration

The Test Configuration feature in the workflow builder allows users to test individual nodes or segments of a workflow without executing the entire workflow. This is particularly useful for debugging and validating node configurations before deploying a workflow.

## Overview

When configuring a node in the workflow builder, nodes that support testing will display a "Test" button in the top-right corner of the configuration modal. This button allows you to execute just that node (and its dependencies) to verify that it works as expected.

## How It Works

1. **Test Button Visibility**: The test button is only visible for nodes marked as `testable: true` in their definition and for nodes that are already saved in the workflow (not pending nodes).

2. **Execution Path**: When you click the "Test" button, the system:
   - Identifies the path from the trigger node to the current node
   - Creates a temporary execution context with sample trigger data
   - Executes each node in the path sequentially
   - Captures the input and output of each node

3. **Data Flow Visualization**: After testing, a data flow panel appears showing:
   - The sample trigger data used
   - The output from each node in the execution path
   - Any errors that occurred during execution

4. **Test Data**: The system uses sample data that mimics what would come from the trigger:
   ```json
   {
     "name": "John Doe",
     "email": "john@example.com",
     "status": "active",
     "amount": 100,
     "date": "2023-07-26T12:00:00.000Z",
     "id": "test-123"
   }
   ```

## Benefits

- **Faster Debugging**: Quickly identify and fix configuration issues without running the entire workflow
- **Reduced Errors**: Validate node configurations before connecting them to other workflow components
- **Better Understanding**: Visualize how data flows through your workflow and how each node transforms it
- **Safe Testing**: Test functionality without triggering real actions (emails aren't actually sent, records aren't actually created)

## Using Test Results

After running a test, you can:

1. **View Input Data**: See what data was passed into the node
2. **Examine Output Data**: Review what the node produced as output
3. **Check for Errors**: Identify any issues that occurred during execution
4. **Refine Configuration**: Make adjustments to the node configuration based on test results

## Limitations

- Tests use sample data that may not perfectly match real-world trigger data
- Some integrations may have limitations on what can be tested in sandbox mode
- Complex dependencies between nodes may not be fully testable

## Example: Testing Gmail Send Email Action

When testing the Gmail Send Email action:

1. Click the "Test" button in the configuration modal
2. The system will simulate sending an email using your configuration
3. You'll see the expected output (message ID, recipients, etc.) without actually sending an email
4. Any configuration errors (missing required fields, invalid email formats) will be displayed

This allows you to validate that your email configuration is correct before activating the workflow.

## Best Practices

- Test each node individually as you build your workflow
- Use test results to refine variable mappings between nodes
- Test the complete workflow path before activating it
- Pay attention to error messages in the test results
