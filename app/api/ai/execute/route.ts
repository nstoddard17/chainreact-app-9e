import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { runWithSmartAI } from '@/lib/ai/workflowSmartAI';
import type { WorkflowNode, WorkflowContext } from '@/lib/ai/workflowSmartAI';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Request validation schema
const ExecuteAIRequestSchema = z.object({
  node: z.object({
    id: z.string(),
    type: z.string(),
    provider: z.string(),
    action: z.string(),
    inputs: z.record(z.any()),
    config: z.object({
      useSmartAI: z.boolean().optional().default(false),
      aiContext: z.object({
        source: z.string().optional(),
        domain: z.string().optional(),
        format: z.enum(['email', 'api', 'form', 'document']).optional(),
        language: z.string().optional().default('en'),
        userInstructions: z.string().optional(),
        metadata: z.record(z.any()).optional()
      }).optional(),
      fallbackToUser: z.boolean().optional().default(true),
      previewMode: z.boolean().optional().default(false)
    }),
    schema: z.array(z.object({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'date', 'email', 'url']),
      required: z.boolean(),
      description: z.string().optional(),
      examples: z.array(z.any()).optional(),
      priority: z.enum(['high', 'medium', 'low']).optional(),
      dependencies: z.array(z.string()).optional()
    })).optional()
  }),
  context: z.object({
    workflowId: z.string(),
    userId: z.string(),
    executionId: z.string().optional(),
    upstreamData: z.record(z.any()).optional().default({}),
    variables: z.record(z.any()).optional().default({}),
    nodeOutputs: z.record(z.any()).optional().default({})
  }),
  options: z.object({
    preview: z.boolean().optional().default(false),
    mergeStrategy: z.enum(['replace', 'merge', 'fill_empty']).optional().default('fill_empty'),
    timeout: z.number().optional().default(30000),
    includeMetadata: z.boolean().optional().default(true)
  }).optional().default({})
});

type ExecuteAIRequest = z.infer<typeof ExecuteAIRequestSchema>;

// Rate limiting: 100 requests per hour per user
const limiter = rateLimit({
  interval: 60 * 60 * 1000, // 1 hour
  uniqueTokenPerInterval: 500, // Max 500 unique users per hour
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedData = ExecuteAIRequestSchema.parse(body);
    
    const { node, context, options } = validatedData;

    // Rate limiting
    const identifier = `ai-execute:${context.userId}`;
    try {
      await limiter.check(100, identifier); // 100 requests per hour
    } catch (error) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          message: 'Too many AI requests. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED'
        },
        { status: 429 }
      );
    }

    // Verify user authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          message: 'Valid authentication token required',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    // Verify token with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user || user.id !== context.userId) {
      return NextResponse.json(
        { 
          error: 'Invalid token',
          message: 'Authentication token is invalid or expired',
          code: 'INVALID_TOKEN'
        },
        { status: 401 }
      );
    }

    // Check if Smart AI is enabled for this node
    if (!node.config.useSmartAI) {
      return NextResponse.json(
        {
          success: false,
          message: 'Smart AI is not enabled for this node',
          extractedFields: {},
          confidence: 0,
          fallbackUsed: true,
          tokensUsed: 0,
          warnings: ['Smart AI not enabled'],
          errors: []
        },
        { status: 200 }
      );
    }

    // Validate workflow access
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, user_id, organization_id')
      .eq('id', context.workflowId)
      .single();

    if (workflowError || !workflow) {
      return NextResponse.json(
        { 
          error: 'Workflow not found',
          message: 'The specified workflow does not exist',
          code: 'WORKFLOW_NOT_FOUND'
        },
        { status: 404 }
      );
    }

    // Check if user has access to the workflow
    const hasAccess = workflow.user_id === context.userId || 
      (workflow.organization_id && await checkOrganizationAccess(context.userId, workflow.organization_id));

    if (!hasAccess) {
      return NextResponse.json(
        { 
          error: 'Access denied',
          message: 'You do not have access to this workflow',
          code: 'ACCESS_DENIED'
        },
        { status: 403 }
      );
    }

    // Execute Smart AI
    const startTime = Date.now();
    
    let result;
    if (options.preview) {
      // Use preview mode for testing/validation
      const { previewAIExtraction } = await import('@/lib/ai/workflowSmartAI');
      result = await previewAIExtraction(node as WorkflowNode, context as WorkflowContext);
    } else {
      // Full execution
      result = await runWithSmartAI(node as WorkflowNode, context as WorkflowContext);
    }

    const executionTime = Date.now() - startTime;

    // Prepare response
    const response = {
      success: result.success,
      extractedFields: result.extractedFields,
      confidence: result.confidence,
      preview: options.preview,
      fallbackUsed: result.fallbackUsed,
      tokensUsed: result.tokensUsed,
      cost: result.cost,
      warnings: result.warnings,
      errors: result.errors,
      ...(options.includeMetadata && {
        metadata: {
          executionTime,
          nodeId: node.id,
          workflowId: context.workflowId,
          userId: context.userId,
          timestamp: new Date().toISOString()
        }
      }),
      ...(result.previewHints && { previewHints: result.previewHints })
    };

    // Log API usage
    await logAPIUsage({
      userId: context.userId,
      workflowId: context.workflowId,
      nodeId: node.id,
      endpoint: '/api/ai/execute',
      success: result.success,
      executionTime,
      tokensUsed: result.tokensUsed,
      cost: result.cost || 0,
      preview: options.preview
    });

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('AI execution API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          message: 'Request body validation failed',
          code: 'VALIDATION_ERROR',
          details: error.errors
        },
        { status: 400 }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON',
          code: 'INVALID_JSON'
        },
        { status: 400 }
      );
    }

    // Handle timeout errors
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return NextResponse.json(
        {
          error: 'Request timeout',
          message: 'AI execution took too long to complete',
          code: 'TIMEOUT_ERROR'
        },
        { status: 408 }
      );
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred during AI execution',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

// GET endpoint for health check and configuration
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'health') {
      // Health check endpoint
      const { workflowSmartAI } = await import('@/lib/ai/workflowSmartAI');
      const health = await workflowSmartAI.healthCheck();
      
      return NextResponse.json({
        status: health.status,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        components: {
          agent: health.agent,
          database: health.database
        },
        details: health.details
      });
    }

    if (action === 'config') {
      // Return available providers and models
      return NextResponse.json({
        providers: [
          {
            name: 'openai',
            models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
            features: ['function_calling', 'streaming']
          },
          {
            name: 'anthropic',
            models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
            features: ['large_context', 'safety_focused']
          },
          {
            name: 'google',
            models: ['gemini-1.5-flash', 'gemini-1.5-pro'],
            features: ['multimodal', 'large_context']
          },
          {
            name: 'mistral',
            models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'],
            features: ['efficient', 'cost_effective']
          }
        ],
        fieldTypes: ['string', 'number', 'boolean', 'array', 'object', 'date', 'email', 'url'],
        formats: ['email', 'api', 'form', 'document'],
        languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'ko', 'zh'],
        rateLimits: {
          requestsPerHour: 100,
          tokensPerMonth: 100000
        }
      });
    }

    return NextResponse.json(
      {
        error: 'Invalid action',
        message: 'Supported actions: health, config',
        code: 'INVALID_ACTION'
      },
      { status: 400 }
    );

  } catch (error) {
    console.error('AI API GET error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to process GET request',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

// Helper functions

async function checkOrganizationAccess(userId: string, organizationId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .single();

    return !error && !!data;
  } catch (error) {
    console.error('Organization access check error:', error);
    return false;
  }
}

interface APIUsageLog {
  userId: string;
  workflowId: string;
  nodeId: string;
  endpoint: string;
  success: boolean;
  executionTime: number;
  tokensUsed: number;
  cost: number;
  preview: boolean;
}

async function logAPIUsage(usage: APIUsageLog): Promise<void> {
  try {
    await supabase
      .from('api_usage_logs')
      .insert({
        user_id: usage.userId,
        workflow_id: usage.workflowId,
        node_id: usage.nodeId,
        endpoint: usage.endpoint,
        success: usage.success,
        execution_time_ms: usage.executionTime,
        tokens_used: usage.tokensUsed,
        cost_estimate: usage.cost,
        preview_mode: usage.preview,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to log API usage:', error);
    // Don't throw error to prevent breaking the main response
  }
}