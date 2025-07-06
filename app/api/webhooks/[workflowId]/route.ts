import { NextResponse } from 'next/server';
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine';
import { createClient } from '@supabase/supabase-js';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

function validateWebhookPayload(payload: any, schema: any): ValidationResult {
  const errors: string[] = [];
  
  if (!schema) {
    // No schema defined, accept all payloads
    return { isValid: true, errors: [] };
  }
  
  // Validate required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in payload)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }
  
  // Validate field types
  if (schema.properties) {
    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      if (payload[fieldName] !== undefined) {
        const fieldValue = payload[fieldName];
        const expectedType = (fieldSchema as any).type;
        
        switch (expectedType) {
          case 'string':
            if (typeof fieldValue !== 'string') {
              errors.push(`Field '${fieldName}' must be a string`);
            }
            break;
          case 'number':
            if (typeof fieldValue !== 'number') {
              errors.push(`Field '${fieldName}' must be a number`);
            }
            break;
          case 'boolean':
            if (typeof fieldValue !== 'boolean') {
              errors.push(`Field '${fieldName}' must be a boolean`);
            }
            break;
          case 'object':
            if (typeof fieldValue !== 'object' || fieldValue === null || Array.isArray(fieldValue)) {
              errors.push(`Field '${fieldName}' must be an object`);
            }
            break;
          case 'array':
            if (!Array.isArray(fieldValue)) {
              errors.push(`Field '${fieldName}' must be an array`);
            }
            break;
        }
        
        // Validate string patterns (regex)
        if (expectedType === 'string' && (fieldSchema as any).pattern) {
          const pattern = new RegExp((fieldSchema as any).pattern);
          if (!pattern.test(fieldValue)) {
            errors.push(`Field '${fieldName}' does not match required pattern`);
          }
        }
        
        // Validate string enums
        if (expectedType === 'string' && (fieldSchema as any).enum) {
          if (!(fieldSchema as any).enum.includes(fieldValue)) {
            errors.push(`Field '${fieldName}' must be one of: ${(fieldSchema as any).enum.join(', ')}`);
          }
        }
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export async function POST(
  request: Request,
  { params }: { params: { workflowId: string } }
) {
  const { workflowId } = params;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('user_id, nodes')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }
    
    const triggerNode = workflow.nodes.find((node: any) => node.data.isTrigger && node.data.triggerType === 'webhook');

    if (!triggerNode) {
      return NextResponse.json({ error: 'No webhook trigger found for this workflow' }, { status: 400 });
    }

    const payload = await request.json();

    // Validate payload against the trigger node's payload schema
    const validationResult = validateWebhookPayload(payload, triggerNode.data.payloadSchema);
    if (!validationResult.isValid) {
      console.error(`Webhook payload validation failed for workflow ${workflowId}:`, validationResult.errors);
      return NextResponse.json({ 
        error: 'Invalid payload', 
        details: validationResult.errors 
      }, { status: 400 });
    }

    const executionEngine = new AdvancedExecutionEngine();
    const executionSession = await executionEngine.createExecutionSession(
      workflowId,
      workflow.user_id,
      'webhook',
      { inputData: payload }
    );

    // Asynchronously execute the workflow without waiting for it to complete
    executionEngine.executeWorkflowAdvanced(executionSession.id, payload);

    return NextResponse.json({ success: true, sessionId: executionSession.id });
  } catch (error: any) {
    console.error(`Webhook error for workflow ${workflowId}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: { workflowId: string } }) {
  return NextResponse.json({
    message: "Webhook endpoint active",
    workflowId: params.workflowId,
    methods: ["POST"],
  })
}
