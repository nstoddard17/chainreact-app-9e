import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_NODE_COMPONENTS } from "../lib/workflows/nodes";

type InventoryEntry = {
  type: string;
  title?: string;
  providerId?: string;
  isTrigger?: boolean;
  category?: string;
  configSchemaLength: number;
  outputSchemaLength: number;
};

function buildInventory(): InventoryEntry[] {
  return ALL_NODE_COMPONENTS.map((node) => ({
    type: node.type,
    title: node.title,
    providerId: node.providerId,
    isTrigger: node.isTrigger,
    category: node.category,
    configSchemaLength: Array.isArray(node.configSchema)
      ? node.configSchema.length
      : 0,
    outputSchemaLength: Array.isArray(node.outputSchema)
      ? node.outputSchema.length
      : 0,
  })).sort((a, b) => a.type.localeCompare(b.type));
}

function writeInventory(entries: InventoryEntry[]) {
  const outPath = resolve(process.cwd(), "docs", "node-inventory.json");
  writeFileSync(outPath, JSON.stringify(entries, null, 2));
  console.log(
    `Generated node inventory with ${entries.length} entries at ${outPath}`
  );
}

writeInventory(buildInventory());
