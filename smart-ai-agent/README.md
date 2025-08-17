# Smart AI Agent

A comprehensive TypeScript library for intelligent field extraction and data processing using multiple AI providers.

## Features

- 🤖 **Multi-Provider Support**: OpenAI, Anthropic, Google, and Mistral
- 🔍 **Intelligent Field Classification**: Priority-based field extraction with context awareness
- 🛡️ **Safety Validation**: Hallucination detection, profanity filtering, and PII protection
- 🔄 **Robust Fallback System**: Multiple fallback strategies for reliable extraction
- 💰 **Token Management**: Budget tracking and optimization across providers
- 📝 **Dynamic Prompts**: Context-aware prompt generation with retry optimization
- 🧪 **Comprehensive Testing**: 56+ test cases covering all scenarios

## Quick Start

```bash
npm install @chainreact/smart-ai-agent
```

```typescript
import SmartAIAgent from '@chainreact/smart-ai-agent';

const agent = new SmartAIAgent({
  aiProvider: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: 'your-api-key'
  },
  maxRetries: 3,
  enableSafety: true,
  enableFallback: true,
  enableTokenManagement: true,
  debugMode: false
});

const schema = [
  { name: 'name', type: 'string', required: true },
  { name: 'email', type: 'email', required: true },
  { name: 'age', type: 'number', required: false }
];

const result = await agent.extractFields(
  'Name: John Doe, Email: john@example.com, Age: 30',
  schema,
  { source: 'form', format: 'form' }
);

console.log(result.data); // { name: 'John Doe', email: 'john@example.com', age: 30 }
```

### Modular Imports

You can also import individual components:

```typescript
// Import specific modules
import FieldClassifier from '@chainreact/smart-ai-agent/fieldClassifier';
import PromptGenerator from '@chainreact/smart-ai-agent/promptGenerator';
import SafetyValidator from '@chainreact/smart-ai-agent/safetyValidator';
import FallbackHandler from '@chainreact/smart-ai-agent/fallbackHandler';
import TokenBudgetManager from '@chainreact/smart-ai-agent/tokenBudgetManager';

// Or import types
import type { 
  SmartAgentConfig, 
  FieldSchema, 
  ExtractionResult 
} from '@chainreact/smart-ai-agent';
```

## Architecture

The Smart AI Agent consists of seven core modules:

### 1. SmartAIAgent (Orchestration Layer)
- Coordinates the entire extraction pipeline
- Manages retries and error handling
- Integrates all components seamlessly

### 2. FieldClassifier
- Analyzes field priority and complexity
- Provides extraction hints and context awareness
- Handles field dependencies

### 3. PromptGenerator
- Creates dynamic, context-aware prompts
- Supports multiple templates and formats
- Optimizes prompts for retries

### 4. SafetyValidator
- Detects hallucinations and inconsistencies
- Filters profanity and inappropriate content
- Identifies PII and sensitive information

### 5. FallbackHandler
- Implements multiple fallback strategies
- Template matching and pattern extraction
- Graceful degradation when AI fails

### 6. TokenBudgetManager
- Tracks usage across all providers
- Manages token limits and costs
- Provides intelligent truncation

### 7. TestSuite
- 56+ comprehensive test cases
- Performance and reliability testing
- Integration and regression tests

## Configuration

```typescript
interface SmartAgentConfig {
  aiProvider: {
    provider: 'openai' | 'anthropic' | 'google' | 'mistral';
    model: string;
    apiKey: string;
    baseURL?: string;
    maxTokens?: number;
    temperature?: number;
  };
  maxRetries: number;
  timeout: number;
  enableSafety: boolean;
  enableFallback: boolean;
  enableTokenManagement: boolean;
  contextWindow: number;
  debugMode: boolean;
}
```

## Field Schema

```typescript
interface FieldSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'email' | 'url';
  required: boolean;
  description?: string;
  validation?: ZodSchema;
  examples?: any[];
  priority?: 'high' | 'medium' | 'low';
  dependencies?: string[];
}
```

## Advanced Usage

### Custom Safety Rules

```typescript
agent.safetyValidator.addCustomRule({
  id: 'custom-rule',
  name: 'Custom Validation',
  type: 'content',
  severity: 'high',
  check: (data, field, context) => {
    // Custom validation logic
    return { passed: true, violations: [] };
  }
});
```

### Fallback Strategies

```typescript
agent.fallbackHandler.addStrategy({
  id: 'custom-fallback',
  name: 'Custom Fallback',
  priority: 80,
  canHandle: (context, fields, errors) => true,
  execute: async (input, fields, context, errors) => {
    // Custom fallback logic
    return extractionResult;
  }
});
```

### Token Management

```typescript
const usage = agent.getUsageStats();
console.log('Total tokens used:', usage.totalTokensUsed);
console.log('Total cost:', usage.totalCost);

// Check health
const health = await agent.healthCheck();
console.log('System status:', health.status);
```

## Testing

Run the comprehensive test suite:

```bash
npm test                    # Run all tests
npm run test:basic         # Run basic extraction tests
npm run test:safety        # Run safety validation tests
npm run test:performance   # Run performance tests
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start development mode
npm run dev

# Lint code
npm run lint
```

## Supported AI Providers

| Provider  | Models | Features |
|-----------|--------|----------|
| OpenAI    | GPT-4o, GPT-4o-mini, GPT-3.5-turbo | Function calling, streaming |
| Anthropic | Claude-3 (Haiku, Sonnet, Opus) | Large context, safety-focused |
| Google    | Gemini 1.5 (Flash, Pro) | Multimodal, large context |
| Mistral   | Mistral (Small, Medium, Large) | Efficient, cost-effective |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- 📚 [Documentation](https://github.com/chainreact/smart-ai-agent/docs)
- 🐛 [Issues](https://github.com/chainreact/smart-ai-agent/issues)
- 💬 [Discussions](https://github.com/chainreact/smart-ai-agent/discussions)