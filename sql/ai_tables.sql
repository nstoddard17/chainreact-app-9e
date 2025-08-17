-- AI Usage Logging Tables for ChainReact Smart AI Agent
-- This file creates the necessary tables and RLS policies for AI usage tracking

-- Table for AI usage logs
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workflow_id UUID,
    execution_id UUID,
    node_id TEXT NOT NULL,
    action_name TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'mistral')),
    model TEXT NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    cost_estimate DECIMAL(10, 6) NOT NULL DEFAULT 0,
    confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    fallback_used BOOLEAN NOT NULL DEFAULT false,
    success BOOLEAN NOT NULL DEFAULT false,
    processing_time_ms INTEGER NOT NULL DEFAULT 0,
    safety_flags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for user AI preferences
CREATE TABLE IF NOT EXISTS ai_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    preferred_tone TEXT NOT NULL DEFAULT 'professional' CHECK (preferred_tone IN ('professional', 'casual', 'friendly', 'formal')),
    retry_policy TEXT NOT NULL DEFAULT 'standard' CHECK (retry_policy IN ('aggressive', 'standard', 'conservative')),
    safety_level TEXT NOT NULL DEFAULT 'high' CHECK (safety_level IN ('high', 'medium', 'low')),
    enable_ai BOOLEAN NOT NULL DEFAULT true,
    preferred_provider TEXT CHECK (preferred_provider IN ('openai', 'anthropic', 'google', 'mistral')),
    max_tokens_per_execution INTEGER DEFAULT 2048 CHECK (max_tokens_per_execution > 0 AND max_tokens_per_execution <= 100000),
    enable_function_calling BOOLEAN NOT NULL DEFAULT false,
    language TEXT NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for user AI budgets and limits
CREATE TABLE IF NOT EXISTS ai_user_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    monthly_limit DECIMAL(10, 2) NOT NULL DEFAULT 10.00 CHECK (monthly_limit >= 0),
    current_usage DECIMAL(10, 6) NOT NULL DEFAULT 0 CHECK (current_usage >= 0),
    reset_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for monthly AI usage statistics
CREATE TABLE IF NOT EXISTS ai_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month TEXT NOT NULL, -- Format: YYYY-MM
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, month)
);

-- Table for AI system analytics (admin only)
CREATE TABLE IF NOT EXISTS ai_system_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,
    total_requests INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost DECIMAL(12, 6) NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    provider_breakdown JSONB DEFAULT '{}',
    error_rate DECIMAL(5, 2) DEFAULT 0,
    avg_confidence DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_workflow_id ON ai_usage_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider ON ai_usage_logs(provider);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_success ON ai_usage_logs(success);

CREATE INDEX IF NOT EXISTS idx_ai_preferences_user_id ON ai_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_user_budgets_user_id ON ai_user_budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_user_budgets_reset_date ON ai_user_budgets(reset_date);

CREATE INDEX IF NOT EXISTS idx_ai_usage_stats_user_month ON ai_usage_stats(user_id, month);
CREATE INDEX IF NOT EXISTS idx_ai_usage_stats_month ON ai_usage_stats(month);

CREATE INDEX IF NOT EXISTS idx_ai_system_analytics_date ON ai_system_analytics(date);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_user_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_system_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_usage_logs
CREATE POLICY "Users can view their own AI usage logs" ON ai_usage_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert AI usage logs" ON ai_usage_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can insert their own AI usage logs" ON ai_usage_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ai_preferences
CREATE POLICY "Users can view their own AI preferences" ON ai_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI preferences" ON ai_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI preferences" ON ai_preferences
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for ai_user_budgets
CREATE POLICY "Users can view their own AI budget" ON ai_user_budgets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage AI budgets" ON ai_user_budgets
    FOR ALL WITH CHECK (true);

CREATE POLICY "Users can insert their own AI budget" ON ai_user_budgets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ai_usage_stats
CREATE POLICY "Users can view their own AI usage stats" ON ai_usage_stats
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage AI usage stats" ON ai_usage_stats
    FOR ALL WITH CHECK (true);

-- RLS Policies for ai_system_analytics (admin only)
CREATE POLICY "Only admins can view system analytics" ON ai_system_analytics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage system analytics" ON ai_system_analytics
    FOR ALL WITH CHECK (true);

-- Functions for automatic updates

-- Function to update ai_preferences updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update ai_user_budgets updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_user_budgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update ai_usage_stats updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_usage_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic timestamp updates
CREATE TRIGGER trigger_update_ai_preferences_updated_at
    BEFORE UPDATE ON ai_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_preferences_updated_at();

CREATE TRIGGER trigger_update_ai_user_budgets_updated_at
    BEFORE UPDATE ON ai_user_budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_user_budgets_updated_at();

CREATE TRIGGER trigger_update_ai_usage_stats_updated_at
    BEFORE UPDATE ON ai_usage_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_usage_stats_updated_at();

-- Function to aggregate daily analytics
CREATE OR REPLACE FUNCTION aggregate_daily_ai_analytics()
RETURNS void AS $$
DECLARE
    target_date DATE := CURRENT_DATE - INTERVAL '1 day';
BEGIN
    INSERT INTO ai_system_analytics (
        date,
        total_requests,
        total_tokens,
        total_cost,
        unique_users,
        provider_breakdown,
        error_rate,
        avg_confidence
    )
    SELECT 
        target_date,
        COUNT(*) as total_requests,
        SUM(tokens_used) as total_tokens,
        SUM(cost_estimate) as total_cost,
        COUNT(DISTINCT user_id) as unique_users,
        json_object_agg(
            provider, 
            json_build_object(
                'requests', COUNT(*),
                'tokens', SUM(tokens_used),
                'cost', SUM(cost_estimate)
            )
        ) as provider_breakdown,
        ROUND((COUNT(*) FILTER (WHERE success = false) * 100.0 / COUNT(*))::numeric, 2) as error_rate,
        ROUND(AVG(confidence_score)::numeric, 2) as avg_confidence
    FROM ai_usage_logs
    WHERE DATE(created_at) = target_date
    ON CONFLICT (date) DO UPDATE SET
        total_requests = EXCLUDED.total_requests,
        total_tokens = EXCLUDED.total_tokens,
        total_cost = EXCLUDED.total_cost,
        unique_users = EXCLUDED.unique_users,
        provider_breakdown = EXCLUDED.provider_breakdown,
        error_rate = EXCLUDED.error_rate,
        avg_confidence = EXCLUDED.avg_confidence;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run daily analytics aggregation
-- Note: This requires pg_cron extension to be enabled
-- SELECT cron.schedule('aggregate-ai-analytics', '0 2 * * *', 'SELECT aggregate_daily_ai_analytics();');

-- Views for common queries

-- View for user AI usage summary (current month)
CREATE OR REPLACE VIEW user_ai_usage_current_month AS
SELECT 
    ual.user_id,
    COUNT(*) as total_requests,
    SUM(ual.tokens_used) as total_tokens,
    SUM(ual.cost_estimate) as total_cost,
    AVG(ual.confidence_score) as avg_confidence,
    COUNT(*) FILTER (WHERE ual.success = true) * 100.0 / COUNT(*) as success_rate,
    COUNT(*) FILTER (WHERE ual.fallback_used = true) * 100.0 / COUNT(*) as fallback_rate
FROM ai_usage_logs ual
WHERE DATE_TRUNC('month', ual.created_at) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY ual.user_id;

-- View for AI provider performance
CREATE OR REPLACE VIEW ai_provider_performance AS
SELECT 
    provider,
    COUNT(*) as total_requests,
    SUM(tokens_used) as total_tokens,
    SUM(cost_estimate) as total_cost,
    AVG(confidence_score) as avg_confidence,
    AVG(processing_time_ms) as avg_processing_time,
    COUNT(*) FILTER (WHERE success = true) * 100.0 / COUNT(*) as success_rate,
    COUNT(*) FILTER (WHERE fallback_used = true) * 100.0 / COUNT(*) as fallback_rate
FROM ai_usage_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY provider
ORDER BY total_requests DESC;

-- Grant necessary permissions
GRANT SELECT ON user_ai_usage_current_month TO authenticated;
GRANT SELECT ON ai_provider_performance TO authenticated;

-- Table for AI memory (embeddings and semantic search)
CREATE TABLE IF NOT EXISTS ai_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workflow_id UUID,
    node_id TEXT,
    type TEXT NOT NULL CHECK (type IN ('extraction', 'user_correction', 'workflow_pattern', 'fallback_pattern')),
    content TEXT NOT NULL,
    context JSONB NOT NULL DEFAULT '{}',
    embedding VECTOR(1536), -- Supports pgvector extension for semantic search
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for function calling logs
CREATE TABLE IF NOT EXISTS ai_function_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workflow_id UUID,
    execution_id UUID,
    function_name TEXT NOT NULL,
    arguments JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error')),
    error_message TEXT,
    execution_time_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for API usage logs (separate from AI usage)
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workflow_id UUID,
    node_id TEXT,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'POST',
    success BOOLEAN NOT NULL DEFAULT false,
    execution_time_ms INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    cost_estimate DECIMAL(10, 6) DEFAULT 0,
    preview_mode BOOLEAN DEFAULT false,
    rate_limited BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_memory_user_id ON ai_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_type ON ai_memory(type);
CREATE INDEX IF NOT EXISTS idx_ai_memory_tags ON ai_memory USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_ai_memory_created_at ON ai_memory(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_memory_workflow_id ON ai_memory(workflow_id);

-- Vector similarity search index (requires pgvector extension)
-- CREATE INDEX IF NOT EXISTS idx_ai_memory_embedding ON ai_memory USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_ai_function_calls_user_id ON ai_function_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_function_calls_function_name ON ai_function_calls(function_name);
CREATE INDEX IF NOT EXISTS idx_ai_function_calls_status ON ai_function_calls(status);
CREATE INDEX IF NOT EXISTS idx_ai_function_calls_created_at ON ai_function_calls(created_at);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_endpoint ON api_usage_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at);

-- RLS Policies for new tables

-- Enable RLS
ALTER TABLE ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_function_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

-- AI Memory policies
CREATE POLICY "Users can view their own AI memory" ON ai_memory
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI memory" ON ai_memory
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI memory" ON ai_memory
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage AI memory" ON ai_memory
    FOR ALL WITH CHECK (true);

-- Function calls policies
CREATE POLICY "Users can view their own function calls" ON ai_function_calls
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage function calls" ON ai_function_calls
    FOR ALL WITH CHECK (true);

-- API usage logs policies
CREATE POLICY "Users can view their own API usage" ON api_usage_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage API usage logs" ON api_usage_logs
    FOR ALL WITH CHECK (true);

-- Function to update ai_memory updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for ai_memory updated_at
CREATE TRIGGER trigger_update_ai_memory_updated_at
    BEFORE UPDATE ON ai_memory
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_memory_updated_at();

-- View for AI memory search (without embeddings for performance)
CREATE OR REPLACE VIEW ai_memory_search AS
SELECT 
    id,
    user_id,
    workflow_id,
    node_id,
    type,
    content,
    context,
    tags,
    created_at,
    updated_at
FROM ai_memory;

-- View for function call statistics
CREATE OR REPLACE VIEW ai_function_call_stats AS
SELECT 
    user_id,
    function_name,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status = 'success') as successful_calls,
    COUNT(*) FILTER (WHERE status = 'error') as failed_calls,
    AVG(execution_time_ms) as avg_execution_time,
    MAX(created_at) as last_called
FROM ai_function_calls
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY user_id, function_name
ORDER BY total_calls DESC;

-- Grant permissions
GRANT SELECT ON ai_memory_search TO authenticated;
GRANT SELECT ON ai_function_call_stats TO authenticated;

-- Comments for documentation
COMMENT ON TABLE ai_usage_logs IS 'Detailed logs of all AI agent executions including costs, performance, and outcomes';
COMMENT ON TABLE ai_preferences IS 'User-specific AI preferences and settings';
COMMENT ON TABLE ai_user_budgets IS 'Monthly spending limits and current usage for users';
COMMENT ON TABLE ai_usage_stats IS 'Aggregated monthly statistics for users';
COMMENT ON TABLE ai_system_analytics IS 'System-wide analytics for administrators';
COMMENT ON TABLE ai_memory IS 'Semantic memory storage with embeddings for AI learning and context';
COMMENT ON TABLE ai_function_calls IS 'Logs of AI function calls and their results';
COMMENT ON TABLE api_usage_logs IS 'HTTP API usage logs for the AI endpoints';

COMMENT ON VIEW user_ai_usage_current_month IS 'Current month AI usage summary per user';
COMMENT ON VIEW ai_provider_performance IS 'Performance metrics for each AI provider over the last 30 days';
COMMENT ON VIEW ai_memory_search IS 'AI memory search view without embeddings for better performance';
COMMENT ON VIEW ai_function_call_stats IS 'Function calling statistics and performance metrics';

-- Table for analytics events
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('ai_extraction', 'function_call', 'api_request', 'user_action', 'error', 'performance')),
    action TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workflow_id UUID,
    node_id TEXT,
    execution_id UUID,
    session_id TEXT,
    user_agent TEXT,
    ip_address INET,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics events
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_action ON analytics_events(action);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_workflow_id ON analytics_events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_metadata ON analytics_events USING GIN(metadata);

-- Enable RLS for analytics events
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for analytics events
CREATE POLICY "Users can view their own analytics events" ON analytics_events
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage analytics events" ON analytics_events
    FOR ALL WITH CHECK (true);

-- View for analytics dashboard
CREATE OR REPLACE VIEW analytics_dashboard AS
SELECT 
    DATE(created_at) as date,
    type,
    COUNT(*) as event_count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT session_id) as unique_sessions,
    AVG(CASE WHEN metadata->>'confidence' IS NOT NULL 
        THEN (metadata->>'confidence')::numeric 
        ELSE NULL END) as avg_confidence,
    AVG(CASE WHEN metadata->>'extractionTime' IS NOT NULL 
        THEN (metadata->>'extractionTime')::numeric 
        ELSE NULL END) as avg_extraction_time,
    COUNT(*) FILTER (WHERE metadata->>'success' = 'true') as successful_events,
    COUNT(*) FILTER (WHERE type = 'error') as error_events
FROM analytics_events
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at), type
ORDER BY date DESC, event_count DESC;

-- View for user behavior analysis
CREATE OR REPLACE VIEW user_behavior_analysis AS
SELECT 
    user_id,
    COUNT(*) as total_events,
    COUNT(DISTINCT DATE(created_at)) as active_days,
    COUNT(DISTINCT session_id) as total_sessions,
    MIN(created_at) as first_seen,
    MAX(created_at) as last_seen,
    COUNT(*) FILTER (WHERE type = 'ai_extraction') as ai_extractions,
    COUNT(*) FILTER (WHERE type = 'error') as error_count,
    AVG(CASE WHEN metadata->>'confidence' IS NOT NULL 
        THEN (metadata->>'confidence')::numeric 
        ELSE NULL END) as avg_confidence,
    (COUNT(*) FILTER (WHERE type = 'error'))::float / 
    NULLIF(COUNT(*) FILTER (WHERE type = 'ai_extraction'), 0) as error_rate
FROM analytics_events
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY user_id
ORDER BY total_events DESC;

-- Grant permissions for analytics views
GRANT SELECT ON analytics_dashboard TO authenticated;
GRANT SELECT ON user_behavior_analysis TO authenticated;

-- Function to aggregate daily analytics (for admin dashboard)
CREATE OR REPLACE FUNCTION aggregate_daily_analytics_v2()
RETURNS void AS $$
DECLARE
    target_date DATE := CURRENT_DATE - INTERVAL '1 day';
BEGIN
    -- Update ai_system_analytics with analytics_events data
    INSERT INTO ai_system_analytics (
        date,
        total_requests,
        total_tokens,
        total_cost,
        unique_users,
        provider_breakdown,
        error_rate,
        avg_confidence
    )
    SELECT 
        target_date,
        COUNT(*) as total_requests,
        SUM(COALESCE((metadata->>'tokenCount')::numeric, 0)) as total_tokens,
        SUM(COALESCE((metadata->>'cost')::numeric, 0)) as total_cost,
        COUNT(DISTINCT user_id) as unique_users,
        json_object_agg(
            COALESCE(metadata->>'provider', 'unknown'), 
            COUNT(*) FILTER (WHERE metadata->>'provider' IS NOT NULL)
        ) as provider_breakdown,
        ROUND((COUNT(*) FILTER (WHERE type = 'error') * 100.0 / COUNT(*))::numeric, 2) as error_rate,
        ROUND(AVG(COALESCE((metadata->>'confidence')::numeric, 0))::numeric, 2) as avg_confidence
    FROM analytics_events
    WHERE DATE(created_at) = target_date
    ON CONFLICT (date) DO UPDATE SET
        total_requests = EXCLUDED.total_requests,
        total_tokens = EXCLUDED.total_tokens,
        total_cost = EXCLUDED.total_cost,
        unique_users = EXCLUDED.unique_users,
        provider_breakdown = EXCLUDED.provider_breakdown,
        error_rate = EXCLUDED.error_rate,
        avg_confidence = EXCLUDED.avg_confidence;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE analytics_events IS 'Comprehensive analytics tracking for all user interactions and system events';
COMMENT ON VIEW analytics_dashboard IS 'Daily analytics dashboard with key metrics';
COMMENT ON VIEW user_behavior_analysis IS 'User behavior patterns and engagement metrics';