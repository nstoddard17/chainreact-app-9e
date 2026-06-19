/**
 * @jest-environment node
 *
 * Action smoke harness — the offline CLI's text parse of the handler inventory
 * must equal the REAL registry.
 *
 * The CLI can't import the handler registry (server-only), so it parses
 * `_handlerInventory.ts` as text. This guard proves that text parse yields
 * exactly the same (provider, action) set as `listRegisteredHandlers()` — so the
 * dry-run inventory can never silently drift from what the engine actually
 * dispatches. If it ever diverges, the regex in inventory.ts needs updating.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
import {
  HANDLER_INVENTORY_PATH,
  parseRegisteredActions,
} from "@/scripts/chainreact/smoke/inventory";

describe("CLI registry parity", () => {
  it("text-parses the exact same action set the real registry reports", () => {
    const inventoryText = readFileSync(resolve(process.cwd(), HANDLER_INVENTORY_PATH), "utf8");
    const parsed = new Set(parseRegisteredActions(inventoryText).map((a) => `${a.provider}:${a.action}`));
    const real = new Set(listRegisteredHandlers().map((h) => `${h.provider}:${h.type}`));

    // Symmetric difference must be empty.
    const onlyInParsed = [...parsed].filter((k) => !real.has(k));
    const onlyInReal = [...real].filter((k) => !parsed.has(k));
    expect({ onlyInParsed, onlyInReal }).toEqual({ onlyInParsed: [], onlyInReal: [] });
  });
});
