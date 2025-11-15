import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine';
import { createClient } from '@supabase/supabase-js';
import { webhookManager } from '@/lib/webhooks/webhookManager';
import crypto from 'crypto';

import { logger } from '@/lib/utils/logger'

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

/**
 * Verify HMAC signature if configured
 * @param payload - The request body
 * @param signature - The signature from request headers
 * @param secret - The HMAC secret
 * @returns boolean indicating if signature is valid
 */
function verifyHmacSignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) {
    return false;
  }

  try {
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  } catch (error) {
    logger.error('HMAC verification error:', error);
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('user_id, nodes')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      return errorResponse('Workflow not found' , 404);
    }
    
    const triggerNode = workflow.nodes.find((node: any) => node.data.isTrigger && node.data.triggerType === 'webhook');

    if (!triggerNode) {
      return errorResponse('No webhook trigger found for this workflow' , 400);
    }

    // Get raw body for HMAC verification
    const rawBody = await request.text();
    const headers = Object.fromEntries(request.headers.entries());

    // Parse JSON payload
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      logger.error('Failed to parse webhook payload:', error);
      return errorResponse('Invalid JSON payload', 400);
    }

    // Check if HMAC signature verification is enabled
    const { data: triggerResource } = await supabase
      .from('trigger_resources')
      .select('config')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'webhook')
      .eq('status', 'active')
      .single();

    // Check if this is a test mode trigger
    const isTestMode = triggerResource?.config?.testMode === true

    if (triggerResource?.config?.hmacSecret && triggerResource?.config?.requireSignature) {
      const signature = headers['x-webhook-signature'] || headers['x-hub-signature-256'];

      if (!signature) {
        logger.error(`Webhook signature required but not provided for workflow ${workflowId}`);
        return errorResponse('Webhook signature required', 401);
      }

      const isValid = verifyHmacSignature(rawBody, signature, triggerResource.config.hmacSecret);

      if (!isValid) {
        logger.error(`Invalid webhook signature for workflow ${workflowId}`);
        return errorResponse('Invalid webhook signature', 401);
      }

      logger.debug(`✅ Webhook signature verified for workflow ${workflowId}`);
    }

    // If in test mode, store the event data in trigger_resources for polling
    if (isTestMode && triggerResource) {
      logger.debug(`🧪 Test mode detected, storing event data for polling`)
      await supabase
        .from('trigger_resources')
        .update({
          config: {
            ...triggerResource.config,
            lastTestEvent: payload,
            lastTestEventTime: new Date().toISOString()
          }
        })
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'webhook')
        .eq('status', 'active')
    }

    // Validate payload against the trigger node's payload schema
    const validationResult = validateWebhookPayload(payload, triggerNode.data.payloadSchema);
    if (!validationResult.isValid) {
      logger.error(`Webhook payload validation failed for workflow ${workflowId}:`, validationResult.errors);
      return errorResponse('Invalid payload', 400, { details: validationResult.errors 
       });
    }

    // Log webhook execution using the webhook manager
    try {
      // Find the webhook config for this workflow
      const { data: webhookConfig } = await supabase
        .from('webhook_configs')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('status', 'active')
        .single();

      if (webhookConfig) {
        // Update webhook stats
        await supabase
          .from('webhook_configs')
          .update({
            last_triggered: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', webhookConfig.id);

        // Log execution
        await supabase.rpc('log_webhook_execution', {
          p_webhook_id: webhookConfig.id,
          p_workflow_id: workflowId,
          p_user_id: workflow.user_id,
          p_trigger_type: webhookConfig.trigger_type,
          p_provider_id: webhookConfig.provider_id,
          p_payload: payload,
          p_headers: headers,
          p_status: 'pending'
        });
      }
    } catch (logError) {
      logger.error('Failed to log webhook execution:', logError);
      // Don't fail the webhook if logging fails
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

    return jsonResponse({ success: true, sessionId: executionSession.id });
  } catch (error: any) {
    logger.error(`Webhook error for workflow ${workflowId}:`, error);
    return errorResponse('Internal server error' , 500);
  }
}

export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    // Get workflow info
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('name, description, user_id')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      return errorResponse('Workflow not found' , 404);
    }

    // Get webhook config for this workflow
    const { data: webhookConfig } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('status', 'active')
      .single();

    return jsonResponse({
      message: "Webhook endpoint active",
      workflow: {
        id: workflowId,
        name: workflow.name,
        description: workflow.description
      },
      webhook: webhookConfig ? {
        id: webhookConfig.id,
        status: webhookConfig.status,
        lastTriggered: webhookConfig.last_triggered,
        errorCount: webhookConfig.error_count
      } : null,
      methods: ["POST"],
      documentation: "Send a POST request with your payload to trigger this workflow"
    });
  } catch (error: any) {
    logger.error(`Error fetching webhook info for workflow ${workflowId}:`, error);
    return errorResponse('Internal server error' , 500);
  }
}
