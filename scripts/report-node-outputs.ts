import { ALL_NODE_COMPONENTS } from "../lib/workflows/nodes";

const actionsMissingOutputs = ALL_NODE_COMPONENTS
  .filter(node => !node.isTrigger)
  .filter(node => !Array.isArray(node.outputSchema) || node.outputSchema.length === 0);

console.log(`Total actions: ${ALL_NODE_COMPONENTS.filter(node => !node.isTrigger).length}`);
console.log(`Actions missing outputSchema: ${actionsMissingOutputs.length}`);

for (const node of actionsMissingOutputs) {
  console.log(`- ${node.type} (${node.title}) provider=${node.providerId ?? "unknown"}`);
}

