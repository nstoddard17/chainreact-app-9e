/**
 * Internal MCP server — tool wiring.
 *
 * The single place that assembles the registry. Every exposed tool is listed
 * here explicitly; there is no dynamic discovery.
 */
import { ToolRegistry } from "../registry";
import { builderGapsTools } from "./builderGaps";
import { commandTools } from "./commands";
import { docsTools } from "./docs";
import { providerTools } from "./providers";

/** Build a registry with every internal MCP tool registered. */
export function buildRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of docsTools) registry.register(tool);
  for (const tool of providerTools) registry.register(tool);
  for (const tool of builderGapsTools()) registry.register(tool);
  for (const tool of commandTools) registry.register(tool);
  return registry;
}
