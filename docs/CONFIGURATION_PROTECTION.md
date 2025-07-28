# Configuration Protection System

This document explains the configuration protection system implemented to prevent common issues with Discord, OAuth, and other integrations.

## Overview

The configuration protection system consists of several layers of validation and type safety to prevent runtime errors and ensure all required environment variables are properly configured.

## Components

### 1. Type Definitions (`types/integration.ts`)

All API requests and responses are now properly typed to prevent parameter mismatches:

```typescript
export interface FetchUserDataRequest {
  integrationId: string
  dataType: string
  options?: Record<string, any>
}

export interface FetchUserDataResponse {
  success: boolean
  data?: any[]
  error?: {
    message: string
    details?: string
    provider?: string
    dataType?: string
  }
}
```

### 2. Configuration Validator (`lib/config/validator.ts`)

Centralized validation for all environment variables:

```typescript
import { configValidator } from '@/lib/config/validator'

// Validate Discord bot configuration
const validation = configValidator.validateDiscordBotConfig()
if (!validation.isValid) {
  console.error('Missing Discord bot credentials:', validation.missingVars)
}
```

### 3. Protected API Client (`lib/api/protectedClient.ts`)

Validates requests and responses before making API calls:

```typescript
import { protectedApiClient } from '@/lib/api/protectedClient'

// This will validate the request and configuration before making the call
const response = await protectedApiClient.fetchUserData({
  integrationId: 'some-id',
  dataType: 'discord_guilds'
})
```

### 4. Health Check Endpoint (`/api/health/config`)

Monitors the health of all configurations:

```bash
curl http://localhost:3000/api/health/config
```

## Environment Variables

### Required for Discord Bot
- `DISCORD_CLIENT_ID` - Discord application client ID (used as bot user ID)
- `DISCORD_CLIENT_SECRET` - Discord application client secret
- `DISCORD_BOT_TOKEN` - Discord bot token

### Required for OAuth Integrations
- `{PROVIDER}_CLIENT_ID` - OAuth client ID for each provider
- `{PROVIDER}_CLIENT_SECRET` - OAuth client secret for each provider

### Required for Encryption
- `ENCRYPTION_KEY` - Key for encrypting sensitive data

### Required for Database
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

## Common Issues and Solutions

### Issue: "Missing Discord bot credentials"
**Solution**: Ensure `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_BOT_TOKEN` are set in environment variables.

### Issue: "API Error Response: /api/integrations/fetch-user-data {}"
**Solution**: Check that the request includes `integrationId` and `dataType` parameters. Use the protected API client to ensure proper validation.

### Issue: "Token validation failed"
**Solution**: Verify that `ENCRYPTION_KEY` is set and the integration tokens are properly encrypted/decrypted.

## Best Practices

### 1. Always Use Type Safety
```typescript
// ✅ Good - Use proper types
const request: FetchUserDataRequest = {
  integrationId: integration.id,
  dataType: 'discord_guilds'
}

// ❌ Bad - No type safety
const request = {
  provider: 'discord', // Wrong parameter name
  dataType: 'discord_guilds'
}
```

### 2. Validate Configuration Before Use
```typescript
// ✅ Good - Validate before making API calls
configValidator.validateDiscordBotConfig()
const response = await apiClient.post('/api/integrations/fetch-user-data', request)

// ❌ Bad - No validation
const response = await apiClient.post('/api/integrations/fetch-user-data', request)
```

### 3. Use Protected API Client
```typescript
// ✅ Good - Use protected client with validation
const response = await protectedApiClient.fetchUserData(request)

// ❌ Bad - Direct API calls without validation
const response = await fetch('/api/integrations/fetch-user-data', {
  method: 'POST',
  body: JSON.stringify(request)
})
```

### 4. Handle Errors Properly
```typescript
// ✅ Good - Proper error handling
try {
  const response = await protectedApiClient.fetchUserData(request)
  if (!response.success) {
    console.error('API Error:', response.error)
    return []
  }
  return response.data || []
} catch (error) {
  console.error('Request failed:', error)
  return []
}
```

## Monitoring

### Health Check
Regularly check the health endpoint to ensure all configurations are valid:

```bash
curl http://localhost:3000/api/health/config
```

### Logs
Monitor logs for configuration validation errors:
- Look for "Configuration validation failed" messages
- Check for missing environment variables
- Monitor API request/response validation errors

## Adding New Integrations

When adding a new integration:

1. **Add Type Definitions**: Define request/response types in `types/integration.ts`
2. **Add Configuration Validation**: Add validation methods to `ConfigValidator`
3. **Use Protected Client**: Use `ProtectedApiClient` for API calls
4. **Add Health Check**: Include the new integration in the health check endpoint
5. **Document**: Update this documentation with the new integration requirements

## Troubleshooting

### Debug Configuration Issues
```bash
# Check all configurations
curl http://localhost:3000/api/health/config

# Check Discord bot specifically
curl http://localhost:3000/api/discord/check-config

# Test Discord bot credentials
curl http://localhost:3000/api/integrations/discord/check-bot-in-guild
```

### Common Environment Variable Issues
- **Missing Variables**: Check that all required variables are set
- **Wrong Names**: Ensure variable names match exactly (case-sensitive)
- **Invalid Values**: Verify that tokens and keys are valid
- **Environment**: Make sure variables are set in the correct environment (development/production)

## Maintenance

### Regular Tasks
1. **Weekly**: Check health endpoint for any configuration issues
2. **Monthly**: Review and update environment variable documentation
3. **Quarterly**: Audit configuration validation rules
4. **Annually**: Review and update type definitions

### When Making Changes
1. **Test**: Always test configuration changes in development first
2. **Validate**: Use the health check endpoint to verify changes
3. **Document**: Update this documentation when adding new configurations
4. **Monitor**: Watch logs for any new validation errors after changes

This protection system ensures that configuration issues are caught early and prevents the types of problems that occurred with the Discord integration. 