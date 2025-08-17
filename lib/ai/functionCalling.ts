/**
 * Function calling system for Smart AI Agent
 * Enables AI to call external APIs and execute workflows
 */

import { z } from 'zod';

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: any;
    }>;
    required: string[];
  };
  handler: (args: any) => Promise<any>;
  category: 'workflow' | 'integration' | 'utility' | 'search';
  permissions?: string[];
  rateLimit?: {
    calls: number;
    period: number; // in seconds
  };
}

export interface FunctionCall {
  id: string;
  name: string;
  arguments: any;
  timestamp: Date;
  status: 'pending' | 'success' | 'error';
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface FunctionCallContext {
  userId: string;
  workflowId?: string;
  nodeId?: string;
  executionId?: string;
  permissions: string[];
  rateLimitKey: string;
}

export class FunctionCallingSystem {
  private functions = new Map<string, FunctionDefinition>();
  private callHistory = new Map<string, FunctionCall[]>();
  private rateLimits = new Map<string, { count: number; resetTime: number }>();

  constructor() {
    this.registerBuiltinFunctions();
  }

  /**
   * Register a new function that AI can call
   */
  registerFunction(definition: FunctionDefinition): void {
    this.functions.set(definition.name, definition);
  }

  /**
   * Get all available functions for the AI
   */
  getAvailableFunctions(context: FunctionCallContext): FunctionDefinition[] {
    return Array.from(this.functions.values()).filter(func => {
      // Check permissions
      if (func.permissions && func.permissions.length > 0) {
        return func.permissions.some(permission => 
          context.permissions.includes(permission)
        );
      }
      return true;
    });
  }

  /**
   * Execute a function call from the AI
   */
  async executeFunction(
    functionCall: {
      name: string;
      arguments: any;
    },
    context: FunctionCallContext
  ): Promise<FunctionCall> {
    const callId = this.generateCallId();
    const call: FunctionCall = {
      id: callId,
      name: functionCall.name,
      arguments: functionCall.arguments,
      timestamp: new Date(),
      status: 'pending'
    };

    try {
      // Get function definition
      const func = this.functions.get(functionCall.name);
      if (!func) {
        throw new Error(`Function '${functionCall.name}' not found`);
      }

      // Check permissions
      if (func.permissions && func.permissions.length > 0) {
        const hasPermission = func.permissions.some(permission => 
          context.permissions.includes(permission)
        );
        if (!hasPermission) {
          throw new Error(`Insufficient permissions for function '${functionCall.name}'`);
        }
      }

      // Check rate limits
      if (func.rateLimit) {
        const rateLimitKey = `${context.rateLimitKey}:${functionCall.name}`;
        if (!this.checkRateLimit(rateLimitKey, func.rateLimit)) {
          throw new Error(`Rate limit exceeded for function '${functionCall.name}'`);
        }
      }

      // Validate arguments
      this.validateArguments(functionCall.arguments, func.parameters);

      // Execute function
      const startTime = Date.now();
      const result = await func.handler(functionCall.arguments);
      const executionTime = Date.now() - startTime;

      call.status = 'success';
      call.result = result;
      call.executionTime = executionTime;

      // Store call history
      this.addToHistory(context.userId, call);

      return call;

    } catch (error) {
      call.status = 'error';
      call.error = error instanceof Error ? error.message : 'Unknown error';
      
      // Store call history even for errors
      this.addToHistory(context.userId, call);
      
      throw error;
    }
  }

  /**
   * Get function call history for a user
   */
  getCallHistory(userId: string, limit: number = 50): FunctionCall[] {
    const history = this.callHistory.get(userId) || [];
    return history.slice(-limit);
  }

  /**
   * Get function call statistics
   */
  getCallStatistics(userId: string): {
    totalCalls: number;
    successfulCalls: number;
    errorCalls: number;
    functionUsage: Record<string, number>;
    avgExecutionTime: number;
  } {
    const history = this.callHistory.get(userId) || [];
    
    const stats = {
      totalCalls: history.length,
      successfulCalls: history.filter(call => call.status === 'success').length,
      errorCalls: history.filter(call => call.status === 'error').length,
      functionUsage: {} as Record<string, number>,
      avgExecutionTime: 0
    };

    // Calculate function usage
    history.forEach(call => {
      stats.functionUsage[call.name] = (stats.functionUsage[call.name] || 0) + 1;
    });

    // Calculate average execution time
    const successfulCalls = history.filter(call => call.status === 'success' && call.executionTime);
    if (successfulCalls.length > 0) {
      const totalTime = successfulCalls.reduce((sum, call) => sum + (call.executionTime || 0), 0);
      stats.avgExecutionTime = totalTime / successfulCalls.length;
    }

    return stats;
  }

  /**
   * Register built-in functions
   */
  private registerBuiltinFunctions(): void {
    // Search function
    this.registerFunction({
      name: 'search_web',
      description: 'Search the web for information',
      category: 'search',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query'
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5)'
          }
        },
        required: ['query']
      },
      handler: async (args) => {
        // Implement web search functionality
        return {
          results: [
            {
              title: 'Example Result',
              url: 'https://example.com',
              snippet: 'This is an example search result'
            }
          ],
          query: args.query,
          total_results: 1
        };
      },
      rateLimit: { calls: 10, period: 60 }
    });

    // Workflow execution function
    this.registerFunction({
      name: 'execute_workflow',
      description: 'Execute another workflow',
      category: 'workflow',
      parameters: {
        type: 'object',
        properties: {
          workflow_id: {
            type: 'string',
            description: 'ID of the workflow to execute'
          },
          inputs: {
            type: 'object',
            description: 'Input data for the workflow'
          }
        },
        required: ['workflow_id']
      },
      handler: async (args) => {
        // Implement workflow execution
        return {
          execution_id: 'exec_123',
          status: 'started',
          workflow_id: args.workflow_id
        };
      },
      permissions: ['workflow:execute'],
      rateLimit: { calls: 5, period: 60 }
    });

    // Data formatting function
    this.registerFunction({
      name: 'format_data',
      description: 'Format data into specified structure',
      category: 'utility',
      parameters: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            description: 'Data to format'
          },
          format: {
            type: 'string',
            description: 'Output format',
            enum: ['json', 'csv', 'xml', 'yaml']
          }
        },
        required: ['data', 'format']
      },
      handler: async (args) => {
        switch (args.format) {
          case 'json':
            return { formatted_data: JSON.stringify(args.data, null, 2) };
          case 'csv':
            // Simple CSV conversion
            if (Array.isArray(args.data)) {
              const headers = Object.keys(args.data[0] || {});
              const rows = args.data.map(row => 
                headers.map(header => row[header] || '').join(',')
              );
              return { formatted_data: [headers.join(','), ...rows].join('\n') };
            }
            return { formatted_data: 'Invalid data for CSV format' };
          case 'yaml':
            // Simple YAML conversion (would use a proper library in production)
            const yamlString = this.objectToYaml(args.data);
            return { formatted_data: yamlString };
          default:
            return { formatted_data: JSON.stringify(args.data) };
        }
      }
    });

    // Time/date function
    this.registerFunction({
      name: 'get_current_time',
      description: 'Get current date and time in various formats',
      category: 'utility',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Timezone (default: UTC)'
          },
          format: {
            type: 'string',
            description: 'Date format',
            enum: ['iso', 'unix', 'human']
          }
        },
        required: []
      },
      handler: async (args) => {
        const now = new Date();
        const timezone = args.timezone || 'UTC';
        const format = args.format || 'iso';

        switch (format) {
          case 'iso':
            return { current_time: now.toISOString(), timezone };
          case 'unix':
            return { current_time: Math.floor(now.getTime() / 1000), timezone };
          case 'human':
            return { current_time: now.toLocaleString('en-US', { timeZone: timezone }), timezone };
          default:
            return { current_time: now.toISOString(), timezone };
        }
      }
    });

    // Math calculation function
    this.registerFunction({
      name: 'calculate',
      description: 'Perform mathematical calculations',
      category: 'utility',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Mathematical expression to evaluate'
          }
        },
        required: ['expression']
      },
      handler: async (args) => {
        try {
          // Simple expression evaluation (in production, use a safer eval library)
          const result = this.safeEval(args.expression);
          return {
            expression: args.expression,
            result,
            type: typeof result
          };
        } catch (error) {
          throw new Error(`Calculation error: ${error.message}`);
        }
      }
    });
  }

  /**
   * Validate function arguments against schema
   */
  private validateArguments(args: any, parameters: FunctionDefinition['parameters']): void {
    // Convert function schema to Zod schema for validation
    const zodSchema = this.convertToZodSchema(parameters);
    zodSchema.parse(args);
  }

  /**
   * Convert function parameter schema to Zod schema
   */
  private convertToZodSchema(parameters: FunctionDefinition['parameters']): z.ZodSchema {
    const shape: Record<string, z.ZodType> = {};

    Object.entries(parameters.properties).forEach(([key, prop]) => {
      let zodType: z.ZodType;

      switch (prop.type) {
        case 'string':
          zodType = z.string();
          if (prop.enum) {
            zodType = z.enum(prop.enum as [string, ...string[]]);
          }
          break;
        case 'number':
          zodType = z.number();
          break;
        case 'boolean':
          zodType = z.boolean();
          break;
        case 'object':
          zodType = z.object({}).passthrough();
          break;
        case 'array':
          zodType = z.array(z.any());
          break;
        default:
          zodType = z.any();
      }

      // Make optional if not required
      if (!parameters.required.includes(key)) {
        zodType = zodType.optional();
      }

      shape[key] = zodType;
    });

    return z.object(shape);
  }

  /**
   * Check rate limit for a function
   */
  private checkRateLimit(key: string, limit: { calls: number; period: number }): boolean {
    const now = Date.now();
    const rateLimit = this.rateLimits.get(key);

    if (!rateLimit || now > rateLimit.resetTime) {
      // Reset or create new rate limit
      this.rateLimits.set(key, {
        count: 1,
        resetTime: now + (limit.period * 1000)
      });
      return true;
    }

    if (rateLimit.count >= limit.calls) {
      return false;
    }

    rateLimit.count++;
    return true;
  }

  /**
   * Add function call to history
   */
  private addToHistory(userId: string, call: FunctionCall): void {
    if (!this.callHistory.has(userId)) {
      this.callHistory.set(userId, []);
    }

    const history = this.callHistory.get(userId)!;
    history.push(call);

    // Keep only last 1000 calls
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
  }

  /**
   * Generate unique call ID
   */
  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Safe evaluation of mathematical expressions
   */
  private safeEval(expression: string): number {
    // Remove any non-mathematical characters for security
    const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, '');
    
    // Basic validation
    if (sanitized !== expression) {
      throw new Error('Expression contains invalid characters');
    }

    // Use Function constructor for safer evaluation than eval
    try {
      const result = new Function(`return ${sanitized}`)();
      
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Expression did not evaluate to a valid number');
      }

      return result;
    } catch (error) {
      throw new Error('Invalid mathematical expression');
    }
  }

  /**
   * Simple object to YAML conversion
   */
  private objectToYaml(obj: any, indent: number = 0): string {
    const spaces = '  '.repeat(indent);
    
    if (obj === null) return 'null';
    if (typeof obj === 'string') return `"${obj}"`;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return obj.map(item => `${spaces}- ${this.objectToYaml(item, indent + 1)}`).join('\n');
    }
    
    if (typeof obj === 'object') {
      const entries = Object.entries(obj);
      if (entries.length === 0) return '{}';
      
      return entries
        .map(([key, value]) => {
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return `${spaces}${key}:\n${this.objectToYaml(value, indent + 1)}`;
          }
          return `${spaces}${key}: ${this.objectToYaml(value, indent + 1)}`;
        })
        .join('\n');
    }
    
    return String(obj);
  }
}

// Export singleton instance
export const functionCallingSystem = new FunctionCallingSystem();

// Helper function to register custom functions
export function registerFunction(definition: FunctionDefinition): void {
  functionCallingSystem.registerFunction(definition);
}

// Helper function to get available functions for OpenAI format
export function getFunctionsForAI(context: FunctionCallContext): any[] {
  const functions = functionCallingSystem.getAvailableFunctions(context);
  
  return functions.map(func => ({
    name: func.name,
    description: func.description,
    parameters: func.parameters
  }));
}

// Helper function to execute function call from AI
export async function executeFunctionCall(
  functionCall: { name: string; arguments: any },
  context: FunctionCallContext
): Promise<any> {
  const result = await functionCallingSystem.executeFunction(functionCall, context);
  
  if (result.status === 'error') {
    throw new Error(result.error);
  }
  
  return result.result;
}