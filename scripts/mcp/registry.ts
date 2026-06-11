/**
 * Internal MCP server — tool registry.
 *
 * The deliberate, explicit list of tools the server exposes. Adding a tool is a
 * code change here plus an implementation in `tools/`. There is no dynamic tool
 * discovery, no plugin loading, and no generic escape-hatch tool.
 */

/** Minimal JSON-Schema object for a tool's arguments. */
export interface JsonSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  /** Stable tool name exposed over MCP. */
  name: string;
  /** Human-readable description shown to the AI host. */
  description: string;
  /** JSON Schema for the tool arguments. */
  inputSchema: JsonSchema;
  /**
   * Handler. Receives validated-shape args (the host enforces the schema; the
   * handler still treats input defensively). Returns plain text — the server
   * wraps it in the MCP `content` envelope and applies output truncation.
   */
  handler: (args: Record<string, unknown>) => string | Promise<string>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
}
