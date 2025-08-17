/**
 * Analytics system for Smart AI Agent
 * Tracks usage patterns, performance metrics, and user behavior
 */

import { supabase } from '../supabase-client';

export interface AnalyticsEvent {
  type: 'ai_extraction' | 'function_call' | 'api_request' | 'user_action' | 'error' | 'performance';
  action: string;
  userId: string;
  workflowId?: string;
  nodeId?: string;
  executionId?: string;
  metadata: Record<string, any>;
  timestamp: Date;
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface PerformanceMetrics {
  extractionTime: number;
  tokenCount: number;
  confidence: number;
  fallbackUsed: boolean;
  provider: string;
  model: string;
  inputLength: number;
  outputLength: number;
  retryCount: number;
  cacheHit: boolean;
}

export interface UsagePattern {
  pattern: string;
  frequency: number;
  avgPerformance: number;
  successRate: number;
  userCount: number;
  lastSeen: Date;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface UserBehaviorInsight {
  userId: string;
  totalSessions: number;
  avgSessionDuration: number;
  preferredProviders: string[];
  commonActions: string[];
  errorRate: number;
  lastActivity: Date;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  preferences: {
    language: string;
    tone: string;
    domains: string[];
  };
}

export interface SystemMetrics {
  date: string;
  totalUsers: number;
  totalExtractions: number;
  totalTokens: number;
  totalCost: number;
  avgConfidence: number;
  successRate: number;
  avgResponseTime: number;
  errorRate: number;
  topProviders: Array<{ provider: string; usage: number }>;
  topActions: Array<{ action: string; count: number }>;
  peakHours: Array<{ hour: number; requests: number }>;
}

export class AnalyticsManager {
  private eventQueue: AnalyticsEvent[] = [];
  private batchSize = 50;
  private flushInterval = 30000; // 30 seconds
  private sessionCache = new Map<string, { start: Date; lastActivity: Date; events: number }>();

  constructor() {
    this.startPeriodicFlush();
  }

  /**
   * Track an analytics event
   */
  async trackEvent(event: Omit<AnalyticsEvent, 'timestamp'>): Promise<void> {
    const fullEvent: AnalyticsEvent = {
      ...event,
      timestamp: new Date()
    };

    // Add to queue for batch processing
    this.eventQueue.push(fullEvent);

    // Update session tracking
    this.updateSessionTracking(event.userId, event.sessionId);

    // Flush if queue is full
    if (this.eventQueue.length >= this.batchSize) {
      await this.flushEvents();
    }
  }

  /**
   * Track AI extraction performance
   */
  async trackAIExtraction(
    userId: string,
    workflowId: string,
    nodeId: string,
    metrics: PerformanceMetrics,
    context: {
      provider: string;
      action: string;
      inputType: string;
      outputType: string;
      sessionId?: string;
    }
  ): Promise<void> {
    await this.trackEvent({
      type: 'ai_extraction',
      action: 'extract_fields',
      userId,
      workflowId,
      nodeId,
      metadata: {
        ...metrics,
        ...context,
        performanceCategory: this.categorizePerformance(metrics.extractionTime, metrics.confidence)
      }
    });

    // Track specific performance metrics
    await this.trackPerformanceMetric(
      'extraction_time',
      metrics.extractionTime,
      {
        provider: metrics.provider,
        model: metrics.model,
        inputLength: metrics.inputLength,
        userId
      }
    );

    await this.trackPerformanceMetric(
      'confidence_score',
      metrics.confidence,
      {
        provider: metrics.provider,
        fallbackUsed: metrics.fallbackUsed,
        userId
      }
    );
  }

  /**
   * Track user behavior and actions
   */
  async trackUserAction(
    userId: string,
    action: string,
    context: {
      workflowId?: string;
      nodeId?: string;
      sessionId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    await this.trackEvent({
      type: 'user_action',
      action,
      userId,
      workflowId: context.workflowId,
      nodeId: context.nodeId,
      sessionId: context.sessionId,
      metadata: context.metadata || {}
    });
  }

  /**
   * Track API usage
   */
  async trackAPIUsage(
    userId: string,
    endpoint: string,
    method: string,
    responseTime: number,
    statusCode: number,
    context: {
      userAgent?: string;
      ipAddress?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    await this.trackEvent({
      type: 'api_request',
      action: `${method}_${endpoint}`,
      userId,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      sessionId: context.sessionId,
      metadata: {
        endpoint,
        method,
        responseTime,
        statusCode,
        success: statusCode < 400
      }
    });
  }

  /**
   * Track errors
   */
  async trackError(
    userId: string,
    errorType: string,
    errorMessage: string,
    context: {
      workflowId?: string;
      nodeId?: string;
      provider?: string;
      action?: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      sessionId?: string;
      stackTrace?: string;
    }
  ): Promise<void> {
    await this.trackEvent({
      type: 'error',
      action: errorType,
      userId,
      workflowId: context.workflowId,
      nodeId: context.nodeId,
      sessionId: context.sessionId,
      metadata: {
        errorMessage,
        provider: context.provider,
        action: context.action,
        severity: context.severity,
        stackTrace: context.stackTrace
      }
    });
  }

  /**
   * Get user behavior insights
   */
  async getUserBehaviorInsights(userId: string): Promise<UserBehaviorInsight | null> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get user events from the last 30 days
      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      if (!events || events.length === 0) {
        return null;
      }

      // Analyze sessions
      const sessions = this.analyzeSessions(events);
      
      // Get preferences from AI preferences table
      const { data: preferences } = await supabase
        .from('ai_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      // Calculate metrics
      const totalSessions = sessions.length;
      const avgSessionDuration = sessions.reduce((sum, s) => sum + s.duration, 0) / totalSessions;
      
      const aiEvents = events.filter(e => e.type === 'ai_extraction');
      const errorEvents = events.filter(e => e.type === 'error');
      const errorRate = errorEvents.length / Math.max(aiEvents.length, 1);

      // Determine skill level
      const skillLevel = this.determineSkillLevel(events, errorRate, avgSessionDuration);

      // Get provider preferences
      const providerCounts: Record<string, number> = {};
      aiEvents.forEach(event => {
        const provider = event.metadata.provider;
        if (provider) {
          providerCounts[provider] = (providerCounts[provider] || 0) + 1;
        }
      });

      const preferredProviders = Object.entries(providerCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([provider]) => provider);

      // Get common actions
      const actionCounts: Record<string, number> = {};
      events.forEach(event => {
        actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;
      });

      const commonActions = Object.entries(actionCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([action]) => action);

      return {
        userId,
        totalSessions,
        avgSessionDuration,
        preferredProviders,
        commonActions,
        errorRate,
        lastActivity: new Date(events[events.length - 1].created_at),
        skillLevel,
        preferences: {
          language: preferences?.language || 'en',
          tone: preferences?.preferred_tone || 'professional',
          domains: this.extractDomains(events)
        }
      };

    } catch (error) {
      console.error('Failed to get user behavior insights:', error);
      return null;
    }
  }

  /**
   * Get usage patterns across all users
   */
  async getUsagePatterns(timeRange: '7d' | '30d' | '90d' = '30d'): Promise<UsagePattern[]> {
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .eq('type', 'ai_extraction');

      if (error) {
        throw error;
      }

      if (!events || events.length === 0) {
        return [];
      }

      // Group events by pattern (provider + action)
      const patterns: Record<string, {
        events: any[];
        users: Set<string>;
      }> = {};

      events.forEach(event => {
        const pattern = `${event.metadata.provider}_${event.metadata.action}`;
        if (!patterns[pattern]) {
          patterns[pattern] = {
            events: [],
            users: new Set()
          };
        }
        patterns[pattern].events.push(event);
        patterns[pattern].users.add(event.user_id);
      });

      // Calculate metrics for each pattern
      const usagePatterns: UsagePattern[] = Object.entries(patterns).map(([pattern, data]) => {
        const { events: patternEvents, users } = data;
        
        const frequency = patternEvents.length;
        const avgPerformance = patternEvents.reduce((sum, e) => 
          sum + (e.metadata.extractionTime || 0), 0
        ) / frequency;
        
        const successRate = patternEvents.filter(e => e.metadata.success !== false).length / frequency;
        const userCount = users.size;
        
        const lastSeen = new Date(Math.max(...patternEvents.map(e => new Date(e.created_at).getTime())));
        
        // Calculate trend (simplified)
        const halfwayPoint = Math.floor(patternEvents.length / 2);
        const firstHalf = patternEvents.slice(0, halfwayPoint);
        const secondHalf = patternEvents.slice(halfwayPoint);
        
        let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
        if (secondHalf.length > firstHalf.length * 1.2) {
          trend = 'increasing';
        } else if (secondHalf.length < firstHalf.length * 0.8) {
          trend = 'decreasing';
        }

        return {
          pattern,
          frequency,
          avgPerformance,
          successRate,
          userCount,
          lastSeen,
          trend
        };
      });

      return usagePatterns.sort((a, b) => b.frequency - a.frequency);

    } catch (error) {
      console.error('Failed to get usage patterns:', error);
      return [];
    }
  }

  /**
   * Get system metrics for dashboard
   */
  async getSystemMetrics(date: string): Promise<SystemMetrics | null> {
    try {
      const startDate = new Date(date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);

      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .lt('created_at', endDate.toISOString());

      if (error) {
        throw error;
      }

      if (!events || events.length === 0) {
        return null;
      }

      const uniqueUsers = new Set(events.map(e => e.user_id)).size;
      const aiEvents = events.filter(e => e.type === 'ai_extraction');
      const errorEvents = events.filter(e => e.type === 'error');

      const totalExtractions = aiEvents.length;
      const totalTokens = aiEvents.reduce((sum, e) => sum + (e.metadata.tokenCount || 0), 0);
      const totalCost = aiEvents.reduce((sum, e) => sum + (e.metadata.cost || 0), 0);
      
      const avgConfidence = aiEvents.length > 0 
        ? aiEvents.reduce((sum, e) => sum + (e.metadata.confidence || 0), 0) / aiEvents.length
        : 0;

      const successfulExtractions = aiEvents.filter(e => e.metadata.success !== false).length;
      const successRate = totalExtractions > 0 ? successfulExtractions / totalExtractions : 0;

      const avgResponseTime = aiEvents.length > 0
        ? aiEvents.reduce((sum, e) => sum + (e.metadata.extractionTime || 0), 0) / aiEvents.length
        : 0;

      const errorRate = events.length > 0 ? errorEvents.length / events.length : 0;

      // Provider usage
      const providerCounts: Record<string, number> = {};
      aiEvents.forEach(event => {
        const provider = event.metadata.provider;
        if (provider) {
          providerCounts[provider] = (providerCounts[provider] || 0) + 1;
        }
      });

      const topProviders = Object.entries(providerCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([provider, usage]) => ({ provider, usage }));

      // Action counts
      const actionCounts: Record<string, number> = {};
      events.forEach(event => {
        actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;
      });

      const topActions = Object.entries(actionCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([action, count]) => ({ action, count }));

      // Peak hours
      const hourCounts: Record<number, number> = {};
      events.forEach(event => {
        const hour = new Date(event.created_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });

      const peakHours = Object.entries(hourCounts)
        .map(([hour, requests]) => ({ hour: parseInt(hour), requests }))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 5);

      return {
        date,
        totalUsers: uniqueUsers,
        totalExtractions,
        totalTokens,
        totalCost,
        avgConfidence,
        successRate,
        avgResponseTime,
        errorRate,
        topProviders,
        topActions,
        peakHours
      };

    } catch (error) {
      console.error('Failed to get system metrics:', error);
      return null;
    }
  }

  /**
   * Get analytics dashboard data
   */
  async getDashboardData(timeRange: '7d' | '30d' | '90d' = '30d'): Promise<{
    overview: {
      totalUsers: number;
      totalExtractions: number;
      avgConfidence: number;
      successRate: number;
    };
    trends: Array<{ date: string; extractions: number; users: number }>;
    topProviders: Array<{ provider: string; usage: number; percentage: number }>;
    userGrowth: Array<{ date: string; newUsers: number; totalUsers: number }>;
    errorAnalysis: Array<{ type: string; count: number; rate: number }>;
  }> {
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      if (!events || events.length === 0) {
        return {
          overview: { totalUsers: 0, totalExtractions: 0, avgConfidence: 0, successRate: 0 },
          trends: [],
          topProviders: [],
          userGrowth: [],
          errorAnalysis: []
        };
      }

      // Calculate overview metrics
      const uniqueUsers = new Set(events.map(e => e.user_id)).size;
      const aiEvents = events.filter(e => e.type === 'ai_extraction');
      const totalExtractions = aiEvents.length;
      
      const avgConfidence = aiEvents.length > 0
        ? aiEvents.reduce((sum, e) => sum + (e.metadata.confidence || 0), 0) / aiEvents.length
        : 0;

      const successfulExtractions = aiEvents.filter(e => e.metadata.success !== false).length;
      const successRate = totalExtractions > 0 ? successfulExtractions / totalExtractions : 0;

      // Calculate daily trends
      const dailyData: Record<string, { extractions: number; users: Set<string> }> = {};
      
      events.forEach(event => {
        const date = new Date(event.created_at).toISOString().split('T')[0];
        if (!dailyData[date]) {
          dailyData[date] = { extractions: 0, users: new Set() };
        }
        
        if (event.type === 'ai_extraction') {
          dailyData[date].extractions++;
        }
        dailyData[date].users.add(event.user_id);
      });

      const trends = Object.entries(dailyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          extractions: data.extractions,
          users: data.users.size
        }));

      // Top providers
      const providerCounts: Record<string, number> = {};
      aiEvents.forEach(event => {
        const provider = event.metadata.provider;
        if (provider) {
          providerCounts[provider] = (providerCounts[provider] || 0) + 1;
        }
      });

      const totalProviderUsage = Object.values(providerCounts).reduce((sum, count) => sum + count, 0);
      const topProviders = Object.entries(providerCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([provider, usage]) => ({
          provider,
          usage,
          percentage: totalProviderUsage > 0 ? (usage / totalProviderUsage) * 100 : 0
        }));

      // User growth (simplified)
      const userGrowth = trends.map((trend, index) => ({
        date: trend.date,
        newUsers: Math.max(0, trend.users - (trends[index - 1]?.users || 0)),
        totalUsers: trend.users
      }));

      // Error analysis
      const errorEvents = events.filter(e => e.type === 'error');
      const errorTypes: Record<string, number> = {};
      
      errorEvents.forEach(event => {
        const errorType = event.metadata.severity || 'unknown';
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      });

      const totalEvents = events.length;
      const errorAnalysis = Object.entries(errorTypes)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => ({
          type,
          count,
          rate: totalEvents > 0 ? (count / totalEvents) * 100 : 0
        }));

      return {
        overview: {
          totalUsers: uniqueUsers,
          totalExtractions,
          avgConfidence,
          successRate
        },
        trends,
        topProviders,
        userGrowth,
        errorAnalysis
      };

    } catch (error) {
      console.error('Failed to get dashboard data:', error);
      return {
        overview: { totalUsers: 0, totalExtractions: 0, avgConfidence: 0, successRate: 0 },
        trends: [],
        topProviders: [],
        userGrowth: [],
        errorAnalysis: []
      };
    }
  }

  /**
   * Flush events to database
   */
  private async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    const events = this.eventQueue.splice(0);

    try {
      const { error } = await supabase
        .from('analytics_events')
        .insert(
          events.map(event => ({
            type: event.type,
            action: event.action,
            user_id: event.userId,
            workflow_id: event.workflowId,
            node_id: event.nodeId,
            execution_id: event.executionId,
            session_id: event.sessionId,
            user_agent: event.userAgent,
            ip_address: event.ipAddress,
            metadata: event.metadata,
            created_at: event.timestamp.toISOString()
          }))
        );

      if (error) {
        console.error('Failed to flush analytics events:', error);
        // Re-add events to queue for retry
        this.eventQueue.unshift(...events);
      }

    } catch (error) {
      console.error('Failed to flush analytics events:', error);
      // Re-add events to queue for retry
      this.eventQueue.unshift(...events);
    }
  }

  /**
   * Start periodic event flushing
   */
  private startPeriodicFlush(): void {
    setInterval(() => {
      this.flushEvents();
    }, this.flushInterval);
  }

  /**
   * Track performance metric
   */
  private async trackPerformanceMetric(
    metric: string,
    value: number,
    context: Record<string, any>
  ): Promise<void> {
    await this.trackEvent({
      type: 'performance',
      action: metric,
      userId: context.userId,
      metadata: {
        metric,
        value,
        ...context
      }
    });
  }

  /**
   * Categorize performance based on time and confidence
   */
  private categorizePerformance(time: number, confidence: number): string {
    if (time < 1000 && confidence > 90) return 'excellent';
    if (time < 3000 && confidence > 80) return 'good';
    if (time < 5000 && confidence > 70) return 'average';
    if (time < 10000 && confidence > 50) return 'below_average';
    return 'poor';
  }

  /**
   * Update session tracking
   */
  private updateSessionTracking(userId: string, sessionId?: string): void {
    const key = sessionId || userId;
    const now = new Date();
    
    if (!this.sessionCache.has(key)) {
      this.sessionCache.set(key, {
        start: now,
        lastActivity: now,
        events: 1
      });
    } else {
      const session = this.sessionCache.get(key)!;
      session.lastActivity = now;
      session.events++;
    }
  }

  /**
   * Analyze user sessions from events
   */
  private analyzeSessions(events: any[]): Array<{ start: Date; end: Date; duration: number; events: number }> {
    const sessions: Record<string, any[]> = {};
    
    // Group events by session (using 30-minute gaps to define session boundaries)
    events.forEach(event => {
      const sessionKey = event.session_id || 'default';
      if (!sessions[sessionKey]) {
        sessions[sessionKey] = [];
      }
      sessions[sessionKey].push(event);
    });

    return Object.values(sessions).map(sessionEvents => {
      sessionEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      const start = new Date(sessionEvents[0].created_at);
      const end = new Date(sessionEvents[sessionEvents.length - 1].created_at);
      const duration = end.getTime() - start.getTime();

      return {
        start,
        end,
        duration,
        events: sessionEvents.length
      };
    });
  }

  /**
   * Determine user skill level based on behavior
   */
  private determineSkillLevel(
    events: any[],
    errorRate: number,
    avgSessionDuration: number
  ): 'beginner' | 'intermediate' | 'advanced' {
    const totalEvents = events.length;
    const aiEvents = events.filter(e => e.type === 'ai_extraction');
    
    // Advanced users: low error rate, many AI events, longer sessions
    if (errorRate < 0.1 && aiEvents.length > 50 && avgSessionDuration > 300000) {
      return 'advanced';
    }
    
    // Intermediate users: moderate usage and errors
    if (errorRate < 0.3 && aiEvents.length > 10 && avgSessionDuration > 120000) {
      return 'intermediate';
    }
    
    return 'beginner';
  }

  /**
   * Extract domains from user events
   */
  private extractDomains(events: any[]): string[] {
    const domains = new Set<string>();
    
    events.forEach(event => {
      if (event.metadata.domain) {
        domains.add(event.metadata.domain);
      }
      if (event.metadata.provider) {
        domains.add(event.metadata.provider);
      }
    });

    return Array.from(domains).slice(0, 5);
  }
}

// Export singleton instance
export const analyticsManager = new AnalyticsManager();

// Helper functions
export async function trackAIExtraction(
  userId: string,
  workflowId: string,
  nodeId: string,
  metrics: PerformanceMetrics,
  context: {
    provider: string;
    action: string;
    inputType: string;
    outputType: string;
    sessionId?: string;
  }
): Promise<void> {
  return analyticsManager.trackAIExtraction(userId, workflowId, nodeId, metrics, context);
}

export async function trackUserAction(
  userId: string,
  action: string,
  context: {
    workflowId?: string;
    nodeId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  return analyticsManager.trackUserAction(userId, action, context);
}

export async function trackError(
  userId: string,
  errorType: string,
  errorMessage: string,
  context: {
    workflowId?: string;
    nodeId?: string;
    provider?: string;
    action?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    sessionId?: string;
    stackTrace?: string;
  }
): Promise<void> {
  return analyticsManager.trackError(userId, errorType, errorMessage, context);
}