import { createAdminClient } from '../supabase/admin';

import { logger } from '@/lib/utils/logger'

export interface AIUsageLogEntry {
  userId: string;
  workflowId: string;
  executionId?: string;
  nodeId: string;
  actionName: string;
  provider: string;
  model: string;
  tokensUsed: number;
  costEstimate: number;
  confidenceScore: number;
  fallbackUsed: boolean;
  success: boolean;
  processingTime: number;
  safetyFlags?: string[];
  metadata?: Record<string, any>;
}

export interface AIUsageSummary {
  totalTokensUsed: number;
  totalCost: number;
  totalRequests: number;
  successRate: number;
  averageConfidence: number;
  providerBreakdown: Record<string, {
    tokens: number;
    cost: number;
    requests: number;
  }>;
  timeRange: {
    start: Date;
    end: Date;
  };
}

export async function logAIUsage(entry: AIUsageLogEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('ai_usage_logs')
      .insert({
        user_id: entry.userId,
        workflow_id: entry.workflowId,
        execution_id: entry.executionId,
        node_id: entry.nodeId,
        action_name: entry.actionName,
        provider: entry.provider,
        model: entry.model,
        tokens_used: entry.tokensUsed,
        cost_estimate: entry.costEstimate,
        confidence_score: entry.confidenceScore,
        fallback_used: entry.fallbackUsed,
        success: entry.success,
        processing_time_ms: entry.processingTime,
        safety_flags: entry.safetyFlags || [],
        metadata: entry.metadata || {},
        created_at: new Date().toISOString()
      });

    if (error) {
      logger.error('Failed to log AI usage:', error);
      throw error;
    }

    // Update user's monthly usage totals
    await updateUserUsageTotals(entry.userId, entry.tokensUsed, entry.costEstimate);

  } catch (error) {
    logger.error('Error logging AI usage:', error);
    // Don't throw error to prevent breaking the main workflow
  }
}

export async function getAIUsageSummary(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<AIUsageSummary> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('ai_usage_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return {
        totalTokensUsed: 0,
        totalCost: 0,
        totalRequests: 0,
        successRate: 0,
        averageConfidence: 0,
        providerBreakdown: {},
        timeRange: { start: startDate, end: endDate }
      };
    }

    const totalTokensUsed = data.reduce((sum, entry) => sum + entry.tokens_used, 0);
    const totalCost = data.reduce((sum, entry) => sum + entry.cost_estimate, 0);
    const totalRequests = data.length;
    const successfulRequests = data.filter(entry => entry.success).length;
    const successRate = (successfulRequests / totalRequests) * 100;
    const averageConfidence = data.reduce((sum, entry) => sum + entry.confidence_score, 0) / totalRequests;

    // Provider breakdown
    const providerBreakdown: Record<string, { tokens: number; cost: number; requests: number }> = {};
    
    data.forEach(entry => {
      if (!providerBreakdown[entry.provider]) {
        providerBreakdown[entry.provider] = {
          tokens: 0,
          cost: 0,
          requests: 0
        };
      }
      
      providerBreakdown[entry.provider].tokens += entry.tokens_used;
      providerBreakdown[entry.provider].cost += entry.cost_estimate;
      providerBreakdown[entry.provider].requests += 1;
    });

    return {
      totalTokensUsed,
      totalCost,
      totalRequests,
      successRate,
      averageConfidence,
      providerBreakdown,
      timeRange: { start: startDate, end: endDate }
    };

  } catch (error) {
    logger.error('Failed to get AI usage summary:', error);
    throw error;
  }
}

export async function getUserAIBudget(userId: string): Promise<{
  monthlyLimit: number;
  currentUsage: number;
  remainingBudget: number;
  resetDate: Date;
} | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('ai_user_budgets')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // Not found error
      throw error;
    }

    if (!data) {
      return null;
    }

    const resetDate = new Date(data.reset_date);
    const currentDate = new Date();
    
    // If past reset date, reset usage
    if (currentDate > resetDate) {
      const nextResetDate = new Date(resetDate);
      nextResetDate.setMonth(nextResetDate.getMonth() + 1);
      
      const supabaseClient = createAdminClient();
      await supabaseClient
        .from('ai_user_budgets')
        .update({
          current_usage: 0,
          reset_date: nextResetDate.toISOString()
        })
        .eq('user_id', userId);

      return {
        monthlyLimit: data.monthly_limit,
        currentUsage: 0,
        remainingBudget: data.monthly_limit,
        resetDate: nextResetDate
      };
    }

    return {
      monthlyLimit: data.monthly_limit,
      currentUsage: data.current_usage,
      remainingBudget: Math.max(0, data.monthly_limit - data.current_usage),
      resetDate
    };

  } catch (error) {
    logger.error('Failed to get user AI budget:', error);
    return null;
  }
}

export async function checkAIBudgetLimit(userId: string, estimatedCost: number): Promise<{
  withinLimit: boolean;
  currentUsage: number;
  monthlyLimit: number;
  wouldExceed: boolean;
}> {
  const budget = await getUserAIBudget(userId);
  
  if (!budget) {
    // No budget set, allow usage
    return {
      withinLimit: true,
      currentUsage: 0,
      monthlyLimit: 0,
      wouldExceed: false
    };
  }

  const wouldExceed = (budget.currentUsage + estimatedCost) > budget.monthlyLimit;
  
  return {
    withinLimit: budget.currentUsage < budget.monthlyLimit,
    currentUsage: budget.currentUsage,
    monthlyLimit: budget.monthlyLimit,
    wouldExceed
  };
}

async function updateUserUsageTotals(userId: string, tokensUsed: number, cost: number): Promise<void> {
  try {
    // Get current budget record
    const supabase = createAdminClient();
    const { data: existingBudget, error: fetchError } = await supabase
      .from('ai_user_budgets')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (!existingBudget) {
      // Create initial budget record
      const currentDate = new Date();
      const resetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      
      const supabaseUpdate = createAdminClient();
      await supabaseUpdate
        .from('ai_user_budgets')
        .insert({
          user_id: userId,
          monthly_limit: 10.0, // Default $10 monthly limit
          current_usage: cost,
          reset_date: resetDate.toISOString(),
          created_at: new Date().toISOString()
        });
    } else {
      // Update existing budget
      await supabase
        .from('ai_user_budgets')
        .update({
          current_usage: existingBudget.current_usage + cost
        })
        .eq('user_id', userId);
    }

    // Also update the monthly totals in ai_usage_stats
    await updateMonthlyStats(userId, tokensUsed, cost);

  } catch (error) {
    logger.error('Failed to update user usage totals:', error);
  }
}

async function updateMonthlyStats(userId: string, tokensUsed: number, cost: number): Promise<void> {
  try {
    const currentDate = new Date();
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    const { data: existingStats, error: fetchError } = await supabase
      .from('ai_usage_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('month', monthKey)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (!existingStats) {
      // Create new monthly stats record
      await supabase
        .from('ai_usage_stats')
        .insert({
          user_id: userId,
          month: monthKey,
          total_tokens: tokensUsed,
          total_cost: cost,
          request_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    } else {
      // Update existing monthly stats
      await supabase
        .from('ai_usage_stats')
        .update({
          total_tokens: existingStats.total_tokens + tokensUsed,
          total_cost: existingStats.total_cost + cost,
          request_count: existingStats.request_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('month', monthKey);
    }

  } catch (error) {
    logger.error('Failed to update monthly stats:', error);
  }
}

export async function getTopAIUsers(limit: number = 10): Promise<Array<{
  userId: string;
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  month: string;
}>> {
  try {
    const currentDate = new Date();
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('ai_usage_stats')
      .select('user_id, total_tokens, total_cost, request_count, month')
      .eq('month', monthKey)
      .order('total_cost', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data.map(record => ({
      userId: record.user_id,
      totalTokens: record.total_tokens,
      totalCost: record.total_cost,
      requestCount: record.request_count,
      month: record.month
    }));

  } catch (error) {
    logger.error('Failed to get top AI users:', error);
    return [];
  }
}

export async function getAIUsageByWorkflow(
  workflowId: string,
  limit: number = 50
): Promise<AIUsageLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('ai_usage_logs')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data.map(record => ({
      userId: record.user_id,
      workflowId: record.workflow_id,
      executionId: record.execution_id,
      nodeId: record.node_id,
      actionName: record.action_name,
      provider: record.provider,
      model: record.model,
      tokensUsed: record.tokens_used,
      costEstimate: record.cost_estimate,
      confidenceScore: record.confidence_score,
      fallbackUsed: record.fallback_used,
      success: record.success,
      processingTime: record.processing_time_ms,
      safetyFlags: record.safety_flags,
      metadata: record.metadata
    }));

  } catch (error) {
    logger.error('Failed to get AI usage by workflow:', error);
    return [];
  }
}