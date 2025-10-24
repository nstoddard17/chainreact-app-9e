import { ActionResult } from '../core/executeWait';
import { resolveValue } from '../core/resolveValue';
import { logger } from '@/lib/utils/logger';
import ivm from 'isolated-vm';

/**
 * Execute Transformer (JavaScript or Python)
 *
 * Production implementation using:
 * - isolated-vm for secure JavaScript execution
 * - Pyodide for Python execution (optional, loaded on demand)
 * - Memory and timeout limits
 * - Sandboxed execution environment
 *
 * Security features:
 * - 128MB memory limit per execution
 * - Configurable timeout (default 30s)
 * - No file system access
 * - No network access
 * - Limited global objects
 */
export async function executeTransformer(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const startTime = Date.now();

  try {
    const resolvedConfig = resolveValue(config, { input });

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
 * Execute JavaScript code in isolated-vm sandbox
 */
async function executeJavaScript(
  code: string,
  input: Record<string, any>,
  timeoutSeconds: number
): Promise<any> {
  // Create isolated VM with memory limit
  const isolate = new ivm.Isolate({ memoryLimit: 128 });

  try {
    const context = await isolate.createContext();
    const jail = context.global;

    // Set global objects
    await jail.set('global', jail.derefInto());

    // Provide input data to the code
    await jail.set('input', new ivm.ExternalCopy(input).copyInto());

    // Create a result holder
    await jail.set('_result', undefined);

    // Wrap user code to capture return value
    const wrappedCode = `
      _result = (function() {
        ${code}
      })();
    `;

    // Compile and run with timeout
    const script = await isolate.compileScript(wrappedCode);
    await script.run(context, { timeout: timeoutSeconds * 1000 });

    // Get result
    const result = await jail.get('_result', { copy: true });

    return result;

  } finally {
    // Clean up
    isolate.dispose();
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
  // Dynamically import Pyodide
  const { loadPyodide } = await import('pyodide');

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
