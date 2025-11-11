# HTTP Request Node - Complete Guide

**Last Updated**: November 10, 2025
**Status**: ✅ Fully Implemented and Production Ready

## Overview

The HTTP Request node is a **critical utility action** that allows users to make HTTP requests to any external API endpoint. It serves as an essential escape hatch for connecting to services that don't have native integrations.

**Why It Matters:**
- Provides flexibility for long-tail use cases
- Industry standard (Zapier, Make, n8n all have this)
- Enables custom integrations without waiting for official support
- Complements native integrations for complete workflow automation

---

## Features

### HTTP Methods
✅ GET - Retrieve data
✅ POST - Create resources
✅ PUT - Update entire resources
✅ PATCH - Update partial resources
✅ DELETE - Remove resources

### Authentication Support
✅ **None** - Public APIs
✅ **Bearer Token** - OAuth 2.0, JWT tokens
✅ **Basic Auth** - Username/password
✅ **API Key** - Custom header-based auth

### Advanced Capabilities
✅ **Custom Headers** - Add any HTTP headers (key-value pairs)
✅ **Query Parameters** - URL parameters for GET requests
✅ **Request Body** - JSON payload for POST/PUT/PATCH
✅ **Variable Resolution** - Use `{{variable}}` placeholders anywhere
✅ **Timeout Control** - Configure timeout (1-300 seconds, default: 30s)
✅ **Response Parsing** - Automatic JSON/text parsing based on Content-Type

---

## Implementation Details

### Node Definition
**File**: `lib/workflows/nodes/providers/logic/index.ts:102-254`

```typescript
{
  type: "http_request",
  title: "HTTP Request",
  description: "Send HTTP requests to any API endpoint with custom headers and body",
  icon: Globe,
  category: "Logic",
  providerId: "logic",
  isTrigger: false,
  testable: true,
  producesOutput: true,
  outputSchema: [
    { name: "status", type: "number", description: "HTTP status code (200, 404, etc.)" },
    { name: "data", type: "object", description: "Response body from the API" },
    { name: "headers", type: "object", description: "Response headers from the API" }
  ]
}
```

### Action Handler
**File**: `lib/workflows/actions/logic/executeHttpRequest.ts`

**Registry Entry**: `lib/workflows/actions/registry.ts:945`

```typescript
"http_request": (params: { config: any; userId: string; input: Record<string, any> }) =>
  executeHttpRequest({
    config: params.config,
    previousOutputs: params.input,
    trigger: params.input.trigger
  })
```

### UI Configuration Component
**File**: `components/workflows/configuration/providers/logic/HttpRequestConfiguration.tsx`

**Features**:
- 3-tab interface (Request, Authentication, Advanced)
- Variable picker integration for dynamic values
- Form validation (URL format, required auth fields)
- Visual feedback for different auth types
- Timeout configuration with validation

**Routing**: `components/workflows/configuration/ConfigurationForm.tsx:1553-1556`

---

## Configuration Schema

### Request Tab

#### Method (Required)
- **Type**: Select dropdown
- **Options**: GET, POST, PUT, PATCH, DELETE
- **Default**: POST

#### URL (Required)
- **Type**: Text input with variable picker
- **Format**: Must be valid URL (https://...)
- **Supports**: Variable resolution (`{{Previous Node.apiUrl}}`)
- **Validation**: URL format check on submit

#### Query Parameters (Optional)
- **Type**: Key-Value pairs
- **Visibility**: Shown for GET requests
- **Features**:
  - Add multiple parameters
  - Variable picker per value
  - Auto-appends to URL as `?key=value&key2=value2`

#### Headers (Optional)
- **Type**: Key-Value pairs
- **Features**:
  - Add custom HTTP headers
  - Variable picker per value
  - Common headers: Content-Type, Accept, User-Agent, etc.

#### Request Body (Optional)
- **Type**: Textarea (JSON format)
- **Visibility**: Shown for POST, PUT, PATCH
- **Features**:
  - Supports variable resolution
  - Syntax highlighting (monospace font)
  - Placeholder shows JSON example

### Authentication Tab

#### Auth Type (Required)
- **Default**: None
- **Options**:

**None**
- No authentication headers added
- Use for public APIs

**Bearer Token**
- Adds `Authorization: Bearer {token}` header
- Field: `bearerToken` (password input with variable picker)
- Common for: OAuth 2.0, JWT tokens

**Basic Auth**
- Adds `Authorization: Basic {base64(username:password)}` header
- Fields: `basicUsername`, `basicPassword` (both with variable picker)
- Auto-encodes credentials

**API Key**
- Adds custom header with API key
- Fields:
  - `apiKeyHeader` - Header name (e.g., X-API-Key, API-Key)
  - `apiKeyValue` - Key value (password input with variable picker)

### Advanced Tab

#### Timeout (Optional)
- **Type**: Number input
- **Default**: 30 seconds
- **Range**: 1-300 seconds
- **Behavior**: Request fails if exceeds timeout

#### Response Data Info
Shows available output variables:
- `{{nodeOutputs.this_node.body}}` - Response body (parsed JSON or text)
- `{{nodeOutputs.this_node.status}}` - HTTP status code (200, 404, etc.)
- `{{nodeOutputs.this_node.headers}}` - Response headers object

---

## Output Schema

The HTTP Request node produces the following outputs:

### Success Response
```typescript
{
  success: true,
  data: {
    status: 200,              // HTTP status code
    statusText: "OK",         // Status message
    headers: {                // Response headers
      "content-type": "application/json",
      "cache-control": "no-cache"
    },
    body: {                   // Parsed response body
      // ... actual response data
    }
  }
}
```

### Error Response
```typescript
{
  success: false,
  error: "HTTP 404: Not Found",  // Error message
  data: {
    status: 404,
    statusText: "Not Found",
    headers: { ... },
    body: { ... }  // Error response body if available
  }
}
```

### Timeout Response
```typescript
{
  success: false,
  error: "Request timeout after 30 seconds"
}
```

---

## Variable Resolution

The HTTP Request node supports variable placeholders in:
- URL
- Headers (values)
- Query Parameters (values)
- Request Body
- Authentication tokens/credentials

**Syntax**: `{{Variable.Path}}`

**Example**:
```json
{
  "url": "https://api.example.com/users/{{trigger.userId}}",
  "headers": [
    { "key": "Authorization", "value": "Bearer {{Previous Node.accessToken}}" }
  ],
  "body": "{\n  \"name\": \"{{trigger.userName}}\",\n  \"email\": \"{{trigger.email}}\"\n}"
}
```

---

## Common Use Cases

### 1. Call Internal Company API
```
Method: POST
URL: https://internal-api.company.com/webhook
Headers: Authorization: Bearer {{Secret.apiKey}}
Body: {"event": "{{trigger.eventType}}", "data": {{trigger.data}}}
```

### 2. Send Data to Third-Party Service
```
Method: POST
URL: https://webhook.site/unique-id
Auth: None
Body: JSON payload with workflow data
```

### 3. Fetch External Data
```
Method: GET
URL: https://api.openweathermap.org/data/2.5/weather
Query Params:
  - q: {{trigger.city}}
  - appid: {{Secret.weatherApiKey}}
```

### 4. Update CRM Record
```
Method: PATCH
URL: https://api.crm.com/v1/contacts/{{trigger.contactId}}
Auth: Bearer {{Integration.crmToken}}
Body: {"status": "updated", "lastActivity": "{{now}}"}
```

### 5. Delete Resource
```
Method: DELETE
URL: https://api.service.com/resources/{{Previous Node.resourceId}}
Auth: API Key
  - Header: X-API-Key
  - Value: {{Secret.serviceKey}}
```

---

## Security Best Practices

### ✅ DO
- Store API keys/tokens in integration credentials (not hardcoded)
- Use HTTPS URLs only
- Validate response status codes
- Set appropriate timeouts
- Use Bearer token auth when available
- Test with sample data before production

### ❌ DON'T
- Hardcode sensitive credentials in URL or body
- Use HTTP (unencrypted) for sensitive data
- Set timeout >60s unless necessary
- Trust all response data without validation
- Expose API keys in error logs

---

## Error Handling

The node handles errors gracefully:

### Network Errors
- Connection failures
- DNS resolution errors
- SSL/TLS errors
- Returns: `success: false` with error message

### HTTP Errors (4xx, 5xx)
- Client errors (400, 401, 404, etc.)
- Server errors (500, 502, 503, etc.)
- Returns: `success: false` with status code and response body

### Timeout Errors
- Request exceeds configured timeout
- Uses AbortController for cancellation
- Returns: `success: false` with timeout message

### Response Parsing Errors
- Invalid JSON responses
- Falls back to raw text
- Returns response as string if JSON parse fails

---

## Testing

### Unit Tests
**File**: `__tests__/workflows/v2/nodes/httpRequest.test.ts`

Tests cover:
- ✅ Successful JSON response parsing
- ✅ HTTP method support
- ✅ Response header extraction
- ✅ Status code handling

### Manual Testing Checklist
- [ ] GET request with query params
- [ ] POST request with JSON body
- [ ] Bearer token authentication
- [ ] Basic auth with credentials
- [ ] API key in custom header
- [ ] Variable resolution in URL
- [ ] Variable resolution in body
- [ ] Timeout configuration
- [ ] Error handling (404, 500, timeout)
- [ ] Response data available in next node

---

## Troubleshooting

### Issue: "URL is required for HTTP request"
**Cause**: Empty URL field
**Fix**: Enter a valid URL starting with `https://`

### Issue: "Request timeout after X seconds"
**Cause**: Remote API took too long to respond
**Fix**: Increase timeout in Advanced tab or optimize API call

### Issue: "Please enter a valid URL"
**Cause**: Invalid URL format
**Fix**: Ensure URL starts with `http://` or `https://` and is properly formatted

### Issue: Authentication failing (401, 403)
**Cause**: Invalid or missing credentials
**Fix**:
- Verify auth type matches API requirements
- Check token/key is not expired
- Confirm variable references are correct

### Issue: Variables not resolving
**Cause**: Incorrect variable syntax or missing previous node output
**Fix**:
- Use exact syntax: `{{Node Name.fieldName}}`
- Verify previous node produced the expected output
- Check variable picker for available fields

### Issue: JSON parsing errors
**Cause**: Response is not valid JSON
**Fix**: API might be returning HTML/text instead of JSON - check API documentation

---

## Future Enhancements

Potential improvements (not currently implemented):

- [ ] OAuth 2.0 flow integration (automatic token refresh)
- [ ] Request body formats (XML, form-data, etc.)
- [ ] File upload support (multipart/form-data)
- [ ] Response data transformation
- [ ] Retry logic with exponential backoff
- [ ] Request/response logging for debugging
- [ ] GraphQL query support
- [ ] SOAP endpoint support

---

## Migration Notes

### V1 vs V2 Implementation

**V1** (Current Production):
- Type: `"http_request"`
- Location: `lib/workflows/nodes/providers/logic/index.ts`
- Handler: `lib/workflows/actions/logic/executeHttpRequest.ts`

**V2** (Future):
- Type: `"http.request"` (dot notation)
- Location: `src/lib/workflows/builder/nodes/httpRequest.ts`
- Simpler schema, cleaner implementation

**Action Required**: Standardize on V1 implementation until V2 migration is complete. Both use same underlying logic but different type identifiers.

---

## Related Documentation

- **Action/Trigger Implementation Guide**: `/learning/docs/action-trigger-implementation-guide.md`
- **Field Implementation Guide**: `/learning/docs/field-implementation-guide.md`
- **Workflow Execution Guide**: `/learning/docs/workflow-execution-implementation-guide.md`
- **Variable Resolution**: Check workflow engine documentation

---

## Support

For issues or questions about the HTTP Request node:
1. Check this documentation first
2. Review the implementation files listed above
3. Test with simple request (e.g., httpbin.org/get)
4. Check browser console for error details
5. Verify API endpoint works outside ChainReact (Postman, curl)

---

**Status Summary**:
- ✅ Node definition complete
- ✅ Action handler implemented
- ✅ UI configuration component built
- ✅ Registry integration done
- ✅ Tests written
- ✅ Production ready
- ✅ NOT marked as "coming soon"
- ✅ Fully functional and available to users
