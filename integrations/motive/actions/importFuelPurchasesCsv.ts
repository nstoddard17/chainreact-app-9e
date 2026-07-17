import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  WORKFLOW_FILES_BUCKET,
  fetchFileBytes,
  type WorkflowFilesStorageAdapter,
} from "@/core/files/fetchFileBytes";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import { fuelPurchaseImportCsv } from "@/integrations/_shared/motive/api/fuelPurchases";
import { resolveCompany } from "./_resolveCompany";
import {
  ImportFuelPurchasesCsvConfigSchema,
  type FuelImportRow,
} from "./importFuelPurchasesCsv.schema";

/**
 * Motive `import_fuel_purchases_csv` — MOTIVE-1 (**live-cert-gated**).
 *
 * Bulk fuel import. Accepts a CSV FileRef (already in Motive's template format —
 * the fuel-card-export case; bytes pass through untouched) OR structured rows
 * that we serialize to CSV using Motive's fuel field names. The bytes/rows are
 * POSTed via the typed wrapper; the exact endpoint + async-job contract are
 * confirmed during live certification (Phase 13). The Setup UX is complete
 * regardless — this is an external-API verification gate, not a deferral.
 *
 * FileRef consumer pattern mirrors `dropbox:upload_file`:
 *   - `v2_storage` → bytes via the Supabase workflow-files adapter.
 *   - `signed_url` → bytes via `fetchFileBytes`'s plain fetch.
 *   - `provider_url` → REJECTED (V2 has no cross-provider bearer fetch).
 *
 * Output is a bounded import summary — never bytes, never the raw provider body.
 */

function buildWorkflowFilesStorageAdapter(
  reason: string,
): WorkflowFilesStorageAdapter {
  return {
    async download(storagePath: string): Promise<Uint8Array> {
      const supabase = getServiceRoleClient(reason);
      const { data, error } = await supabase.storage
        .from(WORKFLOW_FILES_BUCKET)
        .download(storagePath);
      if (error || !data) {
        throw new Error(
          `workflow-files download failed: ${error?.message ?? "no data"}`,
        );
      }
      const buf = await data.arrayBuffer();
      return new Uint8Array(buf);
    },
  };
}

/** CSV-escape one value: wrap in quotes and double any internal quotes. */
function csvCell(value: string | number | undefined): string {
  if (value === undefined) return "";
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

const CSV_COLUMNS = [
  "vehicle_id",
  "driver_id",
  "purchased_at",
  "jurisdiction",
  "fuel_type",
  "fuel",
  "fuel_unit",
  "total_cost",
  "currency",
] as const;

/** Serialize structured rows to a CSV string using Motive's fuel field names. */
function rowsToCsv(rows: readonly FuelImportRow[]): string {
  const header = CSV_COLUMNS.join(",");
  const lines = rows.map((r) =>
    [
      csvCell(r.vehicleId),
      csvCell(r.driverId),
      csvCell(r.purchasedAt),
      csvCell(r.jurisdiction),
      csvCell(r.fuelType),
      csvCell(r.fuel),
      csvCell(r.fuelUnit),
      csvCell(r.totalCost),
      csvCell(r.currency),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

export const importFuelPurchasesCsv: ActionHandler = async (input) => {
  const config = ImportFuelPurchasesCsvConfigSchema.parse(input.config);
  const { providerAccountId } = await resolveCompany(input);

  let csv: string;
  let source: "file" | "rows";
  let rowCount: number | null;

  if (config.csvFile) {
    if (config.csvFile.kind === "provider_url") {
      throw new Error(
        "Motive import_fuel_purchases_csv does not support FileRef(kind=provider_url). Stage the CSV bytes first via a download action, then pass that ref.",
      );
    }
    const storage =
      config.csvFile.kind === "v2_storage"
        ? buildWorkflowFilesStorageAdapter(
            `motive:import_fuel_purchases_csv run=${input.runId} node=${input.nodeId}`,
          )
        : undefined;
    const fetched = await fetchFileBytes(config.csvFile, { storage });
    csv = new TextDecoder("utf-8").decode(fetched.bytes);
    source = "file";
    rowCount = null;
  } else {
    const rows = config.rows ?? [];
    csv = rowsToCsv(rows);
    source = "rows";
    rowCount = rows.length;
  }

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "motive",
    providerAccountId,
    apiCall: (accessToken) =>
      fuelPurchaseImportCsv({ accessToken, csv, dryRun: config.dryRun }),
  });

  return {
    output: {
      accepted: result.accepted,
      jobId: result.jobId,
      acceptedCount: result.acceptedCount,
      message: result.message,
      source,
      rowCount,
      dryRun: config.dryRun,
    },
  };
};
