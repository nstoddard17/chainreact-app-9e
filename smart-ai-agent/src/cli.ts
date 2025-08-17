#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import SmartAIAgent from './smartAIAgent.js';
import type { SmartAgentConfig, FieldSchema, ExtractionContext } from './smartAIAgent.js';

const program = new Command();

interface CLIConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'mistral';
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  maxRetries: number;
  timeout: number;
  enableSafety: boolean;
  enableFallback: boolean;
  debugMode: boolean;
}

const DEFAULT_CONFIG: CLIConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: '',
  maxTokens: 2048,
  temperature: 0.1,
  maxRetries: 3,
  timeout: 30000,
  enableSafety: true,
  enableFallback: true,
  debugMode: false
};

const CONFIG_FILE = '.smart-ai-config.json';

async function loadConfig(): Promise<CLIConfig> {
  try {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const configData = await fs.readFile(configPath, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(configData) };
  } catch (error) {
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(config: CLIConfig): Promise<void> {
  try {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green(`✓ Configuration saved to ${CONFIG_FILE}`));
  } catch (error) {
    console.error(chalk.red(`✗ Failed to save configuration: ${error}`));
  }
}

async function createAgent(config: CLIConfig): Promise<SmartAIAgent> {
  const agentConfig: SmartAgentConfig = {
    aiProvider: {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      maxTokens: config.maxTokens,
      temperature: config.temperature
    },
    maxRetries: config.maxRetries,
    timeout: config.timeout,
    enableSafety: config.enableSafety,
    enableFallback: config.enableFallback,
    enableTokenManagement: true,
    contextWindow: 8192,
    debugMode: config.debugMode
  };

  return new SmartAIAgent(agentConfig);
}

program
  .name('smart-ai')
  .description('CLI for ChainReact Smart AI Agent')
  .version('1.0.0');

// Configuration commands
program
  .command('config')
  .description('Configure the Smart AI Agent')
  .option('--provider <provider>', 'AI provider (openai, anthropic, google, mistral)')
  .option('--model <model>', 'AI model name')
  .option('--api-key <key>', 'API key for the provider')
  .option('--max-tokens <number>', 'Maximum tokens per request')
  .option('--temperature <number>', 'Temperature for AI responses (0-1)')
  .option('--max-retries <number>', 'Maximum number of retries')
  .option('--timeout <number>', 'Request timeout in milliseconds')
  .option('--safety', 'Enable safety validation')
  .option('--no-safety', 'Disable safety validation')
  .option('--fallback', 'Enable fallback handling')
  .option('--no-fallback', 'Disable fallback handling')
  .option('--debug', 'Enable debug mode')
  .option('--no-debug', 'Disable debug mode')
  .option('--interactive', 'Interactive configuration')
  .action(async (options) => {
    try {
      let config = await loadConfig();

      if (options.interactive) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'provider',
            message: 'Select AI provider:',
            choices: ['openai', 'anthropic', 'google', 'mistral'],
            default: config.provider
          },
          {
            type: 'input',
            name: 'model',
            message: 'AI model name:',
            default: config.model
          },
          {
            type: 'password',
            name: 'apiKey',
            message: 'API key:',
            default: config.apiKey,
            mask: '*'
          },
          {
            type: 'number',
            name: 'maxTokens',
            message: 'Maximum tokens per request:',
            default: config.maxTokens
          },
          {
            type: 'number',
            name: 'temperature',
            message: 'Temperature (0-1):',
            default: config.temperature
          },
          {
            type: 'confirm',
            name: 'enableSafety',
            message: 'Enable safety validation?',
            default: config.enableSafety
          },
          {
            type: 'confirm',
            name: 'enableFallback',
            message: 'Enable fallback handling?',
            default: config.enableFallback
          }
        ]);

        config = { ...config, ...answers };
      } else {
        // Update config with CLI options
        if (options.provider) config.provider = options.provider;
        if (options.model) config.model = options.model;
        if (options.apiKey) config.apiKey = options.apiKey;
        if (options.maxTokens) config.maxTokens = parseInt(options.maxTokens);
        if (options.temperature) config.temperature = parseFloat(options.temperature);
        if (options.maxRetries) config.maxRetries = parseInt(options.maxRetries);
        if (options.timeout) config.timeout = parseInt(options.timeout);
        if (options.safety !== undefined) config.enableSafety = options.safety;
        if (options.fallback !== undefined) config.enableFallback = options.fallback;
        if (options.debug !== undefined) config.debugMode = options.debug;
      }

      await saveConfig(config);
    } catch (error) {
      console.error(chalk.red(`Configuration error: ${error}`));
      process.exit(1);
    }
  });

// Show current configuration
program
  .command('config:show')
  .description('Show current configuration')
  .action(async () => {
    try {
      const config = await loadConfig();
      console.log(chalk.blue('\nCurrent Configuration:'));
      console.log(chalk.gray('─'.repeat(40)));
      
      Object.entries(config).forEach(([key, value]) => {
        if (key === 'apiKey') {
          const maskedKey = value ? `${value.substring(0, 8)}...` : 'Not set';
          console.log(`${chalk.cyan(key.padEnd(15))}: ${maskedKey}`);
        } else {
          console.log(`${chalk.cyan(key.padEnd(15))}: ${value}`);
        }
      });
      
      console.log(chalk.gray('─'.repeat(40)));
    } catch (error) {
      console.error(chalk.red(`Error showing configuration: ${error}`));
    }
  });

// Extract fields from text
program
  .command('extract')
  .description('Extract fields from text using AI')
  .argument('<text>', 'Text to extract fields from')
  .option('-s, --schema <file>', 'JSON file containing field schema')
  .option('-f, --format <format>', 'Output format (json, table, yaml)', 'json')
  .option('--source <source>', 'Data source context', 'cli')
  .option('--domain <domain>', 'Domain context', 'general')
  .option('--language <lang>', 'Language for extraction', 'en')
  .action(async (text, options) => {
    try {
      const config = await loadConfig();
      
      if (!config.apiKey) {
        console.error(chalk.red('✗ API key not configured. Run: smart-ai config --interactive'));
        process.exit(1);
      }

      const agent = await createAgent(config);

      let schema: FieldSchema[] = [];
      
      if (options.schema) {
        const schemaData = await fs.readFile(options.schema, 'utf-8');
        schema = JSON.parse(schemaData);
      } else {
        // Use default schema for general extraction
        schema = [
          { name: 'name', type: 'string', required: false, description: 'Person or entity name' },
          { name: 'email', type: 'email', required: false, description: 'Email address' },
          { name: 'phone', type: 'string', required: false, description: 'Phone number' },
          { name: 'date', type: 'date', required: false, description: 'Any date mentioned' },
          { name: 'amount', type: 'number', required: false, description: 'Monetary amount or quantity' },
          { name: 'location', type: 'string', required: false, description: 'Geographic location' }
        ];
      }

      const context: ExtractionContext = {
        source: options.source,
        domain: options.domain,
        format: 'document',
        language: options.language
      };

      console.log(chalk.blue('🤖 Extracting fields...'));
      
      const result = await agent.extractFields(text, schema, context);

      if (result.success) {
        console.log(chalk.green('✓ Extraction completed'));
        console.log(chalk.gray(`Confidence: ${result.confidence}%`));
        console.log(chalk.gray(`Tokens used: ${result.metadata.tokensUsed}`));
        
        if (result.warnings.length > 0) {
          console.log(chalk.yellow(`⚠️  Warnings: ${result.warnings.join(', ')}`));
        }

        switch (options.format) {
          case 'table':
            console.table(result.data);
            break;
          case 'yaml':
            console.log(require('yaml').stringify(result.data));
            break;
          default:
            console.log(JSON.stringify(result.data, null, 2));
        }
      } else {
        console.error(chalk.red('✗ Extraction failed'));
        result.errors.forEach(error => console.error(chalk.red(`  ${error}`)));
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red(`Extraction error: ${error}`));
      process.exit(1);
    }
  });

// Test configuration
program
  .command('test')
  .description('Test the AI agent configuration')
  .option('--provider <provider>', 'Test specific provider')
  .action(async (options) => {
    try {
      const config = await loadConfig();
      
      if (options.provider) {
        config.provider = options.provider as any;
      }
      
      if (!config.apiKey) {
        console.error(chalk.red('✗ API key not configured. Run: smart-ai config --interactive'));
        process.exit(1);
      }

      console.log(chalk.blue('🧪 Testing AI agent configuration...'));
      
      const agent = await createAgent(config);
      const health = await agent.healthCheck();

      if (health.status === 'healthy') {
        console.log(chalk.green('✓ AI agent is healthy'));
        console.log(chalk.gray(`Provider: ${config.provider}`));
        console.log(chalk.gray(`Model: ${config.model}`));
      } else {
        console.log(chalk.yellow(`⚠️  AI agent status: ${health.status}`));
        console.log(health.details);
      }

      // Test basic extraction
      const testResult = await agent.extractFields(
        'My name is John Doe and my email is john@example.com',
        [
          { name: 'name', type: 'string', required: true },
          { name: 'email', type: 'email', required: true }
        ],
        { source: 'test', format: 'document' }
      );

      if (testResult.success) {
        console.log(chalk.green('✓ Basic extraction test passed'));
        console.log(chalk.gray(`Extracted: ${JSON.stringify(testResult.data)}`));
      } else {
        console.log(chalk.yellow('⚠️  Basic extraction test failed'));
        testResult.errors.forEach(error => console.error(chalk.red(`  ${error}`)));
      }

    } catch (error) {
      console.error(chalk.red(`Test error: ${error}`));
      process.exit(1);
    }
  });

// Generate schema template
program
  .command('schema:generate')
  .description('Generate a schema template for field extraction')
  .argument('<type>', 'Schema type (email, form, api, document)')
  .option('-o, --output <file>', 'Output file path')
  .action(async (type, options) => {
    const schemas: Record<string, FieldSchema[]> = {
      email: [
        { name: 'to', type: 'email', required: true, description: 'Recipient email address' },
        { name: 'subject', type: 'string', required: true, description: 'Email subject line' },
        { name: 'body', type: 'string', required: true, description: 'Email content' },
        { name: 'cc', type: 'array', required: false, description: 'CC recipients' },
        { name: 'attachments', type: 'array', required: false, description: 'File attachments' }
      ],
      form: [
        { name: 'firstName', type: 'string', required: true, description: 'First name' },
        { name: 'lastName', type: 'string', required: true, description: 'Last name' },
        { name: 'email', type: 'email', required: true, description: 'Email address' },
        { name: 'phone', type: 'string', required: false, description: 'Phone number' },
        { name: 'company', type: 'string', required: false, description: 'Company name' }
      ],
      api: [
        { name: 'endpoint', type: 'url', required: true, description: 'API endpoint URL' },
        { name: 'method', type: 'string', required: true, description: 'HTTP method' },
        { name: 'headers', type: 'object', required: false, description: 'Request headers' },
        { name: 'body', type: 'object', required: false, description: 'Request body' }
      ],
      document: [
        { name: 'title', type: 'string', required: false, description: 'Document title' },
        { name: 'author', type: 'string', required: false, description: 'Document author' },
        { name: 'date', type: 'date', required: false, description: 'Document date' },
        { name: 'summary', type: 'string', required: false, description: 'Document summary' },
        { name: 'keywords', type: 'array', required: false, description: 'Key topics or tags' }
      ]
    };

    const schema = schemas[type.toLowerCase()];
    
    if (!schema) {
      console.error(chalk.red(`✗ Unknown schema type: ${type}`));
      console.log(chalk.gray('Available types: email, form, api, document'));
      process.exit(1);
    }

    const schemaJson = JSON.stringify(schema, null, 2);

    if (options.output) {
      await fs.writeFile(options.output, schemaJson);
      console.log(chalk.green(`✓ Schema template saved to ${options.output}`));
    } else {
      console.log(schemaJson);
    }
  });

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    console.log(chalk.blue('🤖 Smart AI Agent - Interactive Mode'));
    console.log(chalk.gray('Type "exit" to quit, "help" for commands\n'));

    const config = await loadConfig();
    
    if (!config.apiKey) {
      console.error(chalk.red('✗ API key not configured. Run: smart-ai config --interactive'));
      process.exit(1);
    }

    const agent = await createAgent(config);

    while (true) {
      try {
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              'Extract fields from text',
              'Test agent health',
              'View configuration',
              'Exit'
            ]
          }
        ]);

        if (action === 'Exit') {
          console.log(chalk.green('👋 Goodbye!'));
          break;
        }

        if (action === 'View configuration') {
          console.log(chalk.blue('\nCurrent Configuration:'));
          Object.entries(config).forEach(([key, value]) => {
            if (key === 'apiKey') {
              const maskedKey = value ? `${value.substring(0, 8)}...` : 'Not set';
              console.log(`${chalk.cyan(key)}: ${maskedKey}`);
            } else {
              console.log(`${chalk.cyan(key)}: ${value}`);
            }
          });
          continue;
        }

        if (action === 'Test agent health') {
          console.log(chalk.blue('Testing agent health...'));
          const health = await agent.healthCheck();
          console.log(chalk.green(`Status: ${health.status}`));
          continue;
        }

        if (action === 'Extract fields from text') {
          const { text } = await inquirer.prompt([
            {
              type: 'editor',
              name: 'text',
              message: 'Enter the text to extract fields from:'
            }
          ]);

          const defaultSchema = [
            { name: 'name', type: 'string', required: false, description: 'Person or entity name' },
            { name: 'email', type: 'email', required: false, description: 'Email address' },
            { name: 'phone', type: 'string', required: false, description: 'Phone number' },
            { name: 'date', type: 'date', required: false, description: 'Any date mentioned' }
          ];

          console.log(chalk.blue('Extracting fields...'));
          
          const result = await agent.extractFields(text, defaultSchema, {
            source: 'interactive',
            format: 'document'
          });

          if (result.success) {
            console.log(chalk.green('\n✓ Extraction completed'));
            console.log(chalk.gray(`Confidence: ${result.confidence}%`));
            console.table(result.data);
          } else {
            console.error(chalk.red('\n✗ Extraction failed'));
            result.errors.forEach(error => console.error(chalk.red(`  ${error}`)));
          }
        }

      } catch (error) {
        if (error.message === 'User force closed the prompt with 0 null') {
          console.log(chalk.green('\n👋 Goodbye!'));
          break;
        }
        console.error(chalk.red(`Error: ${error}`));
      }
    }
  });

// Usage statistics
program
  .command('stats')
  .description('Show usage statistics')
  .action(async () => {
    try {
      const config = await loadConfig();
      const agent = await createAgent(config);
      const stats = agent.getUsageStats();

      console.log(chalk.blue('\n📊 Usage Statistics'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`${chalk.cyan('Total Requests'.padEnd(20))}: ${stats.totalRequests}`);
      console.log(`${chalk.cyan('Total Tokens'.padEnd(20))}: ${stats.totalTokensUsed.toLocaleString()}`);
      console.log(`${chalk.cyan('Total Cost'.padEnd(20))}: $${stats.totalCost.toFixed(4)}`);
      console.log(`${chalk.cyan('Success Rate'.padEnd(20))}: ${stats.successRate.toFixed(1)}%`);
      console.log(chalk.gray('─'.repeat(40)));

    } catch (error) {
      console.error(chalk.red(`Stats error: ${error}`));
    }
  });

// Error handling
process.on('unhandledRejection', (error) => {
  console.error(chalk.red(`Unhandled error: ${error}`));
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log(chalk.green('\n👋 Goodbye!'));
  process.exit(0);
});

// Parse CLI arguments
program.parse();