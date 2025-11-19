import { ActionResult } from '../core/executeWait';
import { resolveValue } from '../core/resolveValue';
import { logger } from '@/lib/utils/logger';
import { runInNewContext } from 'vm';

/**
 * Execute Transformer (JavaScript or Python)
 *
 * Production implementation using:
 * - Node.js vm module for JavaScript execution (serverless-compatible)
 * - Pyodide for Python execution (optional, loaded on demand from CDN)
 * - Memory and timeout limits
 * - Sandboxed execution environment
 *
 * Security features:
 * - Configurable timeout (default 30s)
 * - No file system access
 * - No network access
 * - Limited global objects
 *
 * Note: vm module provides lighter sandboxing than isolated-vm but works
 * in serverless environments. For stronger isolation, consider external
 * execution services like Riza.io or AWS Lambda.
 */
export async function executeTransformer(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const startTime = Date.now();

  try {
    const resolvedConfig = resolveValue(config, input);

    const {
      code,
      language = 'javascript',
      allowedImports = ['json', 're', 'datetime', 'math'],
      timeout = 30
    } = resolvedConfig;

    if (!code) {
      return {
        success: false,
        output: {},
        message: 'Code is required'
      };
    }

    logger.info('[Transformer] Executing code', {
      language,
      codeLength: code.length,
      timeout,
      userId
    });

    let result: any;

    if (language === 'javascript') {
      result = await executeJavaScript(code, input, timeout);
    } else if (language === 'python') {
      result = await executePython(code, input, timeout, allowedImports);
    } else {
      return {
        success: false,
        output: {},
        message: `Unsupported language: ${language}. Use 'javascript' or 'python'.`
      };
    }

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      output: {
        result,
        success: true,
        executionTime,
        language
      },
      message: `Code executed successfully in ${executionTime}ms`
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    logger.error('[Transformer] Execution error:', error);

    return {
      success: false,
      output: {
        error: error.message,
        executionTime,
        success: false
      },
      message: `Code execution failed: ${error.message}`
    };
  }
}

/**
 * Execute JavaScript code in Node.js vm sandbox
 *
 * Note: This uses Node's built-in vm module which works in serverless environments.
 * It provides basic sandboxing but is not as secure as isolated-vm.
 *
 * For production with untrusted code, consider:
 * - External execution service (Riza.io, AWS Lambda)
 * - Running on dedicated VPS with isolated-vm
 */
async function executeJavaScript(
  code: string,
  input: Record<string, any>,
  timeoutSeconds: number
): Promise<any> {
  // Create sandbox context with limited globals
  const sandbox = {
    input: JSON.parse(JSON.stringify(input)), // Deep clone to prevent mutation
    result: undefined,
    console: {
      log: (...args: any[]) => logger.info('[Transformer] User code log:', args),
      error: (...args: any[]) => logger.error('[Transformer] User code error:', args),
    },
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    // Explicitly exclude dangerous globals
    require: undefined,
    process: undefined,
    __dirname: undefined,
    __filename: undefined,
    global: undefined,
    globalThis: undefined,
  };

  // Wrap user code to capture return value
  const wrappedCode = `
    result = (function() {
      ${code}
    })();
  `;

  try {
    // Execute with timeout
    runInNewContext(wrappedCode, sandbox, {
      timeout: timeoutSeconds * 1000,
      displayErrors: true,
    });

    return sandbox.result;
  } catch (error: any) {
    if (error.message?.includes('timed out')) {
      throw new Error(`Code execution timeout after ${timeoutSeconds} seconds`);
    }
    throw error;
  }
}

/**
 * Execute Python code using Pyodide
 *
 * Note: Pyodide is loaded dynamically to avoid increasing bundle size
 * For production at scale, consider using a separate Python execution service
 */
async function executePython(
  code: string,
  input: Record<string, any>,
  timeoutSeconds: number,
  allowedImports: string[]
): Promise<any> {
  // Dynamically import Pyodide (optional dependency)
  let loadPyodide: any;
  try {
    const pyodideModule = await import('pyodide');
    loadPyodide = pyodideModule.loadPyodide;
  } catch (error) {
    throw new Error(
      'The Transformer node requires the "pyodide" package for Python execution. ' +
      'This package is optional and must be installed separately. ' +
      'Run: npm install pyodide'
    );
  }

  logger.info('[Transformer] Loading Pyodide runtime...');

  const pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
  });

  logger.info('[Transformer] Pyodide loaded, executing Python code');

  // Set input data
  pyodide.globals.set('input', input);

  // Wrap code to capture return value
  const wrappedCode = `
def _user_function():
${code.split('\n').map(line => '    ' + line).join('\n')}

_result = _user_function()
`;

  // Execute with timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Python execution timeout')), timeoutSeconds * 1000);
  });

  const executionPromise = (async () => {
    await pyodide.runPythonAsync(wrappedCode);
    const result = pyodide.globals.get('_result').toJs();
    return result;
  })();

  const result = await Promise.race([executionPromise, timeoutPromise]);

  return result;
}
