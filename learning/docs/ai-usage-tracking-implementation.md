# AI Usage Tracking Implementation Guide

## Overview
This document outlines the comprehensive AI usage tracking system with user-friendly limits and monitoring capabilities.

## System Architecture

### 1. Database Schema (✅ Complete)
**Location**: `/scripts/create-ai-usage-tables.sql`

Tables created:
- `ai_usage_records` - One record per AI call with idempotent request_id
- `ai_usage_budgets` - Monthly budgets per user/organization
- `ai_usage_statistics` - Pre-computed stats for performance
- `ai_model_pricing` - Configurable pricing table
- `ai_usage_reconciliation` - Provider report reconciliation
- `ai_usage_alerts` - Track alerts sent to users

### 2. OpenAI Proxy API (✅ Complete)
**Location**: `/app/api/ai/chat/route.ts`

Features implemented:
- ✅ Routes all OpenAI calls through server
- ✅ Attaches user_id, model, action, and UUID request_id
- ✅ Tracks usage from API responses
- ✅ Calculates costs using pricing map
- ✅ Saves one record per call
- ✅ Idempotent retries using request_id
- ✅ Never calls OpenAI from browser
- ✅ Budget enforcement (soft/hard limits)
- ✅ Alert generation at 75%, 90%, 100% thresholds

### 3. User Usage Endpoints (To Implement)

#### GET `/api/ai/usage`
Returns user's current usage statistics:
```typescript
interface UsageResponse {
  current_period: {
    start_date: string
    end_date: string
    total_tokens: number
    total_cost_usd: number
    budget_usd: number
    usage_percent: number
    remaining_uses_estimate: {
      min: number
      max: number
      confidence: 'high' | 'medium' | 'low'
    }
  }
  today: {
    requests: number
    tokens: number
    cost_usd: number
  }
  all_time: {
    requests: number
    tokens: number
    cost_usd: number
  }
}
```

#### GET `/api/ai/usage/estimate`
Estimates remaining uses based on recent activity:
```typescript
interface EstimateResponse {
  action: string
  model: string
  median_tokens: number
  variance: number
  estimated_remaining: {
    min: number
    max: number
  }
  confidence: 'high' | 'medium' | 'low'
}
```

### 4. Admin Dashboard Components (To Implement)

#### `/app/admin/ai-usage/page.tsx`
Admin dashboard showing:
- Per-user totals (today, month, all-time)
- Budget management interface
- Usage trends and charts
- Reconciliation status
- Alert history

### 5. User-Facing UI Components (To Implement)

#### `AIUsageIndicator.tsx`
Progress bar component showing:
- Current billing period usage (0-100%)
- Color coding: Green (0-75%), Yellow (75-90%), Red (90-100%)
- No dollar amounts shown to users
- Estimated uses remaining (when confidence is high)

#### `AIUsageWarning.tsx`
Alert component showing:
- 75% threshold: "Optimize your usage" CTA
- 90% threshold: "Consider upgrading" CTA
- 100% threshold: "Upgrade to continue" with hard stop

#### `AIUsageDrawer.tsx`
Advanced stats for power users:
- Token usage breakdown by model
- Usage trends over time
- Cost optimization suggestions
- Model switching recommendations

### 6. Reconciliation Job (To Implement)

#### `/app/api/cron/reconcile-ai-usage/route.ts`
Nightly job that:
- Pulls OpenAI usage reports via API
- Compares with our tracked totals
- Creates reconciliation records
- Sends alerts on mismatches > threshold

### 7. Configuration

#### Pricing Configuration
Update model pricing without code changes:
```sql
UPDATE ai_model_pricing 
SET prompt_price_per_1k = 0.002,
    completion_price_per_1k = 0.006
WHERE provider = 'openai' AND model = 'gpt-3.5-turbo';
```

#### Budget Configuration
Set user/org budgets:
```sql
INSERT INTO ai_usage_budgets (user_id, monthly_budget_usd, enforcement_mode)
VALUES ('user-uuid', 25.00, 'soft');
```

## Implementation Checklist

### Phase 1: Core Infrastructure ✅
- [x] Database schema creation
- [x] OpenAI proxy with tracking
- [x] Cost calculation
- [x] Idempotent request handling
- [x] Budget checking
- [x] Alert generation

### Phase 2: User Experience (In Progress)
- [ ] User usage API endpoints
- [ ] Usage estimation logic
- [ ] Progress bar component
- [ ] Warning/alert components
- [ ] Advanced stats drawer

### Phase 3: Admin & Monitoring
- [ ] Admin dashboard
- [ ] Budget management UI
- [ ] Reconciliation job
- [ ] Mismatch alerting
- [ ] Usage analytics

### Phase 4: Optimization
- [ ] Streaming support with usage tracking
- [ ] Multi-provider support (Anthropic, etc.)
- [ ] Usage caching for performance
- [ ] Batch processing for high volume

## Security Considerations

1. **No client-side AI calls**: All OpenAI requests go through our server
2. **No raw data logging**: Prompts/outputs not stored by default
3. **Secure token handling**: API keys only on server
4. **Rate limiting**: Per-user request limits
5. **Budget enforcement**: Hard stops prevent runaway costs

## User Experience Flow

1. User makes AI request → Server proxy
2. Server checks budget → Allow/Deny
3. Server calls OpenAI → Track usage
4. Response to user → Update statistics
5. Usage approaches limit → Show warnings
6. Limit reached → Block with upgrade CTA

## Testing Strategy

1. **Unit Tests**:
   - Cost calculation accuracy
   - Budget enforcement logic
   - Alert threshold detection

2. **Integration Tests**:
   - End-to-end AI request flow
   - Usage tracking accuracy
   - Reconciliation matching

3. **Load Tests**:
   - High volume request handling
   - Database performance
   - Real-time statistics updates

## Monitoring & Alerts

1. **Usage Metrics**:
   - Requests per minute
   - Token usage trends
   - Cost accumulation rate

2. **System Health**:
   - API response times
   - Database query performance
   - Reconciliation success rate

3. **Business Metrics**:
   - Users approaching limits
   - Upgrade conversion rate
   - Cost per user trends

## Next Steps

1. Implement user usage endpoints
2. Build UI components for usage display
3. Create admin dashboard
4. Set up reconciliation job
5. Add comprehensive testing
6. Deploy with monitoring

## Notes

- Default budget: $10/month per user
- Soft limit: Warning only at 100%
- Hard limit: Blocks requests at 100%
- Reconciliation runs nightly at 2 AM UTC
- Alerts sent via in-app notifications
- Usage stats cached for 5 minutes