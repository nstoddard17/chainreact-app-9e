/**
 * ANALYTICS-CONNECTED-DATA-CD-4D Phase A — HubSpot Deals READ-ONLY live
 * certification.
 *
 * WHY THIS EXISTS: the proposed Custom Insights dataset (hubspot/deals) builds
 * measures on amount, createdate, pipeline, dealstage, hs_is_closed /
 * hs_is_closed_won and deal_currency_code with `sorts` + `after` cursor
 * pagination on the CRM v3 Search API. The FIXED analytics source is
 * deliberately count-only (`properties: []`, reads only `total`) — the amount
 * wire type, currency source, closed/won flags, sort acceptance and paged
 * cursor behavior have NEVER been observed through this codebase. Each is
 * proven against the real API before any dataset code is written.
 *
 * STRICTLY READ-ONLY: POST /crm/v3/objects/deals/search (read semantics),
 * GET /crm/v3/pipelines/deals, GET /oauth/v1/access-tokens/{token} (identity),
 * GET /account-info/v3/details (portal currency concept) only. No deal,
 * pipeline, stage, contact or company is created, changed, moved, archived or
 * deleted; no scope or portal-settings change. Credentials resolve only
 * through the canonical seam (getActiveForExecution + refreshAndRetry);
 * ciphertext is never touched.
 *
 * EVIDENCE SAFETY: prints status classes, counts, presence tallies, JS types,
 * distinct-value counts and timings only. It never prints the portal id, a
 * pipeline or stage name, a deal id or name, an amount, a currency code, an
 * owner, a token, or a raw payload. Deal ids are read transiently ONLY to
 * check page-boundary uniqueness and are never printed.
 *
 * Run:  npx tsx scripts/trash/hubspot-deals-analytics-cert.ts
 */

import { readFileSync } from "node:fs";

function loadEnv(): void {
  for (const path of [
    "C:/Users/marcu/source/repos/ChainReactV2/.env.local",
    ".env.local",
  ]) {
    try {
      const text = readFileSync(path, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && process.env[m[1]!] === undefined) {
          process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
        }
      }
      return;
    } catch {
      /* next */
    }
  }
  throw new Error("no .env.local found");
}

type Verdict = "PASS" | "FAIL" | "SKIP";
const results: { check: string; verdict: Verdict; detail: string }[] = [];
function record(check: string, verdict: Verdict, detail: string): void {
  results.push({ check, verdict, detail });
  console.log(`[${verdict}] ${check} — ${detail}`);
}

function classify(err: unknown): string {
  const name = err instanceof Error ? err.constructor.name : typeof err;
  const status = (err as { status?: number } | null)?.status;
  return `${name}${status ? ` status=${status}` : ""}`;
}

/** Properties the proposed dataset needs — nothing free-text, no associations. */
const CERT_PROPERTIES = [
  "amount",
  "createdate",
  "closedate",
  "pipeline",
  "dealstage",
  "hs_is_closed",
  "hs_is_closed_won",
  "deal_currency_code",
  "hs_lastmodifieddate",
] as const;

interface RawDeal {
  id?: unknown;
  properties?: Record<string, string | null>;
}
interface SearchPage {
  total: number;
  results: RawDeal[];
  nextAfter: string | null;
  rateHeaders: string[];
  status429: boolean;
  ms: number;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const AMOUNT_RE = /^-?\d+(\.\d+)?$/;
const CCY_RE = /^[A-Z]{3}$/;

function prop(r: RawDeal, name: string): string | null {
  const v = r.properties?.[name];
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function main(): Promise<void> {
  loadEnv();

  const { hubspotApiBase, HUBSPOT_CRM_VERSION } = await import(
    "@/integrations/_shared/hubspot/api/_base"
  );

  // ── 0. Live guard — real HubSpot host only, no mock/base override ─────────
  const base = hubspotApiBase();
  if (process.env.HUBSPOT_API_BASE || base !== "https://api.hubapi.com") {
    record("live_guard", "FAIL", "HUBSPOT_API_BASE override detected — refusing a mock run");
    return summarize();
  }
  record("live_guard", "PASS", "no API-base override — calls hit the real HubSpot API");

  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry, Unauthorized401Error } = await import(
    "@/services/oauth/refreshAndRetry"
  );
  const { pipelinesList } = await import("@/integrations/_shared/hubspot/api/pipelines");
  const { resolveHubSpotAccount } = await import("@/integrations/_shared/hubspot/api/me");

  const accountId = process.env.SMOKE_ACCOUNT_ID;
  if (!accountId) throw new Error("SMOKE_ACCOUNT_ID unset");
  const integration = await getActiveForExecution(accountId, "hubspot", null);
  if (!integration) {
    record("connection", "FAIL", "no active HubSpot integration for the smoke account");
    return summarize();
  }
  record(
    "connection",
    "PASS",
    `active account-class HubSpot integration resolved (stored portal ref present=${integration.providerAccountId !== null})`,
  );

  // HubSpot precedent (fixed analytics adapter + all option resolvers): the
  // account's single portal connection, providerAccountId=null (not user-pinned).
  const call = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({
      accountId: integration.accountId,
      provider: "hubspot",
      providerAccountId: null,
      apiCall,
    });
  const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
    const t0 = Date.now();
    return [await fn(), Date.now() - t0];
  };

  // Raw search POST — the shared dealsSearch wrapper cannot send `sorts` and
  // discards rate-limit headers; both are certification targets. Read-only.
  const searchTimings: number[] = [];
  let any429 = false;
  let rateHeadersSeen: string[] = [];
  const searchDeals = (
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<SearchPage> => {
    const t0 = Date.now();
    return fetch(`${base}/crm/${HUBSPOT_CRM_VERSION}/objects/deals/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const ms = Date.now() - t0;
      searchTimings.push(ms);
      const rateHeaders = [...res.headers.keys()].filter((h) =>
        h.toLowerCase().startsWith("x-hubspot-ratelimit"),
      );
      if (rateHeaders.length > 0) rateHeadersSeen = rateHeaders;
      if (res.status === 401) throw new Unauthorized401Error("HubSpot deal search HTTP 401");
      if (res.status === 429) {
        any429 = true;
        throw new Error("HTTP 429");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        total?: unknown;
        results?: RawDeal[];
        paging?: { next?: { after?: string } };
      };
      return {
        total: typeof json.total === "number" ? json.total : 0,
        results: json.results ?? [],
        nextAfter: json.paging?.next?.after ?? null,
        rateHeaders,
        status429: false,
        ms,
      };
    });
  };

  // ── 1. Portal identity — token portal matches the stored connection ───────
  try {
    const [account, ms] = await timed(() => call((t) => resolveHubSpotAccount(t)));
    const matches =
      integration.providerAccountId === null ||
      String(account.hubId) === String(integration.providerAccountId);
    record(
      "portal_identity",
      matches ? "PASS" : "FAIL",
      `token-derived portal resolved server-side in ${ms}ms · matches stored connection=${matches} · source=${account.source} · portal id never client-supplied on the query path (no portal parameter exists)`,
    );
  } catch (err) {
    record("portal_identity", "FAIL", `identity resolution → ${classify(err)}`);
  }

  // ── 2. Pipeline + stage metadata ───────────────────────────────────────────
  let pipelineIds: string[] = [];
  const stageToPipeline = new Map<string, string>();
  const stageClosedWon = new Map<string, { isClosed: boolean | null; probability: string | null }>();
  try {
    const [resp, ms] = await timed(() =>
      call((t) => pipelinesList({ accessToken: t, objectType: "deals" })),
    );
    const pipelines = (resp.results ?? []).filter((p) => p.archived !== true);
    let stages = 0;
    let stagesWithLabel = 0;
    let stagesWithOrder = 0;
    let stagesWithProbability = 0;
    let stagesWithIsClosed = 0;
    let duplicateStageIds = 0;
    for (const p of pipelines) {
      pipelineIds.push(p.id);
      for (const s of p.stages ?? []) {
        if (s.archived === true) continue;
        stages += 1;
        if (typeof s.label === "string" && s.label.length > 0) stagesWithLabel += 1;
        if (typeof s.displayOrder === "number") stagesWithOrder += 1;
        const meta = s.metadata ?? {};
        const probability = typeof meta.probability === "string" ? meta.probability : null;
        const isClosedRaw = meta.isClosed;
        const isClosed =
          typeof isClosedRaw === "boolean"
            ? isClosedRaw
            : isClosedRaw === "true"
              ? true
              : isClosedRaw === "false"
                ? false
                : null;
        if (probability !== null) stagesWithProbability += 1;
        if (isClosed !== null) stagesWithIsClosed += 1;
        if (stageToPipeline.has(s.id)) duplicateStageIds += 1;
        stageToPipeline.set(s.id, p.id);
        stageClosedWon.set(s.id, { isClosed, probability });
      }
    }
    record(
      "pipelines_metadata",
      pipelines.length > 0 && stages > 0 && stagesWithLabel === stages ? "PASS" : "FAIL",
      `pipelines=${pipelines.length} · stages=${stages} · labels=${stagesWithLabel}/${stages} · displayOrder=${stagesWithOrder}/${stages} · metadata.probability=${stagesWithProbability}/${stages} · metadata.isClosed=${stagesWithIsClosed}/${stages} · stage-id collisions across pipelines=${duplicateStageIds} · ${ms}ms`,
    );
  } catch (err) {
    record("pipelines_metadata", "FAIL", `GET pipelines/deals → ${classify(err)}`);
  }

  // ── 3. Wire types + sort acceptance over a bounded page ───────────────────
  let rows: RawDeal[] = [];
  let unfilteredTotal = 0;
  try {
    const page = await call((t) =>
      searchDeals(t, {
        limit: 100,
        properties: CERT_PROPERTIES,
        sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      }),
    );
    rows = page.results;
    unfilteredTotal = page.total;
    const createdSeq = rows.map((r) => prop(r, "createdate")).filter(Boolean) as string[];
    const createdIso = createdSeq.filter((v) => ISO_RE.test(v)).length;
    const createdEpoch = createdSeq.filter((v) => /^\d{12,14}$/.test(v)).length;
    const sortedDesc = createdSeq.every(
      (v, i) => i === 0 || Date.parse(createdSeq[i - 1]!) >= Date.parse(v),
    );
    const idTypes = [...new Set(rows.map((r) => typeof r.id))].join(",");
    const amountVals = rows.map((r) => prop(r, "amount")).filter(Boolean) as string[];
    const amountShaped = amountVals.filter((v) => AMOUNT_RE.test(v)).length;
    record(
      rows.length > 0 ? "deal_wire_types" : "deal_wire_types",
      rows.length > 0 && page.total >= rows.length ? "PASS" : "FAIL",
      rows.length > 0
        ? `total=${page.total} · rows=${rows.length} · id js=[${idTypes}] · createdate ISO=${createdIso}/${createdSeq.length} epoch-shaped=${createdEpoch}/${createdSeq.length} · sorts:[createdate DESC] accepted+monotone=${sortedDesc} · amount string-decimal=${amountShaped}/${amountVals.length} (properties arrive as strings) · ${page.ms}ms`
        : "0 deals in the portal — wire types unobservable",
    );
  } catch (err) {
    record("deal_wire_types", "FAIL", `deal search → ${classify(err)}`);
  }
  if (rows.length === 0) {
    record(
      "deal_semantics",
      "FAIL",
      "no deals exist — amount/currency/stage semantics and pagination CANNOT be certified",
    );
    return summarize({ blocked: true });
  }

  // ── 4. Amount semantics ────────────────────────────────────────────────────
  const amounts = rows.map((r) => prop(r, "amount"));
  const nonNull = amounts.filter((v): v is string => v !== null);
  const parseable = nonNull.filter((v) => AMOUNT_RE.test(v));
  const negatives = parseable.filter((v) => v.startsWith("-")).length;
  const maxFrac = parseable.reduce((mx, v) => {
    const i = v.indexOf(".");
    return i === -1 ? mx : Math.max(mx, v.length - i - 1);
  }, 0);
  record(
    "amount_semantics",
    nonNull.length >= 3 && parseable.length === nonNull.length ? "PASS" : "FAIL",
    `usable amounts=${nonNull.length}/${rows.length} (blank=${rows.length - nonNull.length}) · parseable decimal-string=${parseable.length}/${nonNull.length} · negatives=${negatives} · max fractional digits=${maxFrac} · current recorded amount only (HubSpot supplies no historical amount snapshot)`,
  );

  // ── 5. Currency source ─────────────────────────────────────────────────────
  const dealCcy = rows.map((r) => prop(r, "deal_currency_code"));
  const dealCcyPresent = dealCcy.filter((v): v is string => v !== null);
  const dealCcyIso = dealCcyPresent.filter((v) => CCY_RE.test(v)).length;
  const distinctDealCcy = new Set(dealCcyPresent).size;
  let portalCcyOk = false;
  let portalCcyDetail = "not attempted";
  try {
    const [info, ms] = await timed(() =>
      call((t) =>
        fetch(`${base}/account-info/v3/details`, {
          headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
        }).then(async (res) => {
          if (res.status === 401) throw new Unauthorized401Error("account-info HTTP 401");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as { companyCurrency?: unknown };
        }),
      ),
    );
    portalCcyOk = typeof info.companyCurrency === "string" && CCY_RE.test(info.companyCurrency);
    portalCcyDetail = `GET /account-info/v3/details 200 in ${ms}ms · companyCurrency present+ISO=${portalCcyOk} (value not recorded)`;
  } catch (err) {
    portalCcyDetail = `GET /account-info/v3/details → ${classify(err)}`;
  }
  const currencyCertified = dealCcyPresent.length === rows.length || portalCcyOk;
  record(
    "currency_source",
    currencyCertified ? "PASS" : "FAIL",
    `deal_currency_code present=${dealCcyPresent.length}/${rows.length} (ISO-shaped=${dealCcyIso}, distinct=${distinctDealCcy}) · portal home currency: ${portalCcyDetail} · strategy=${
      dealCcyPresent.length === rows.length
        ? "per-deal currency"
        : portalCcyOk
          ? "certified portal home currency for deals without an explicit code"
          : "NONE — money measures blocked"
    }`,
  );

  // ── 6. Stage/pipeline domain + open/won/lost semantics ────────────────────
  const rowPipelines = rows.map((r) => prop(r, "pipeline"));
  const rowStages = rows.map((r) => prop(r, "dealstage"));
  const pipelineResolved = rowPipelines.filter((p) => p !== null && pipelineIds.includes(p)).length;
  const stageResolved = rowStages.filter((s) => s !== null && stageToPipeline.has(s)).length;
  const stageInDeclaredPipeline = rows.filter((r) => {
    const p = prop(r, "pipeline");
    const s = prop(r, "dealstage");
    return p !== null && s !== null && stageToPipeline.get(s) === p;
  }).length;
  const closedFlags = rows.map((r) => prop(r, "hs_is_closed"));
  const wonFlags = rows.map((r) => prop(r, "hs_is_closed_won"));
  const boolShaped = (vs: (string | null)[]) =>
    vs.filter((v) => v === "true" || v === "false").length;
  const openCount = closedFlags.filter((v) => v === "false").length;
  const closedCount = closedFlags.filter((v) => v === "true").length;
  const wonCount = wonFlags.filter((v) => v === "true").length;
  const flagsAgreeWithMetadata = rows.filter((r) => {
    const s = prop(r, "dealstage");
    const meta = s !== null ? stageClosedWon.get(s) : undefined;
    const flag = prop(r, "hs_is_closed");
    if (!meta || meta.isClosed === null || flag === null) return true;
    return String(meta.isClosed) === flag;
  }).length;
  record(
    "stage_status_semantics",
    stageResolved === rows.length && stageInDeclaredPipeline === rows.length ? "PASS" : "FAIL",
    `pipeline id resolves against metadata=${pipelineResolved}/${rows.length} · stage id resolves=${stageResolved}/${rows.length} · stage belongs to its row's pipeline=${stageInDeclaredPipeline}/${rows.length} · hs_is_closed bool-string=${boolShaped(closedFlags)}/${rows.length} · hs_is_closed_won bool-string=${boolShaped(wonFlags)}/${rows.length} · open=${openCount} closed=${closedCount} won=${wonCount} · flags agree with stage metadata.isClosed=${flagsAgreeWithMetadata}/${rows.length} · distinct pipelines in data=${new Set(rowPipelines.filter(Boolean)).size} · distinct stages in data=${new Set(rowStages.filter(Boolean)).size} · distinct created dates=${new Set(rows.map((r) => (prop(r, "createdate") ?? "").slice(0, 10)).values()).size}`,
  );

  // ── 7. Date filter push-down (createdate GTE/LT epoch-ms) ─────────────────
  const createdMs = rows
    .map((r) => prop(r, "createdate"))
    .filter(Boolean)
    .map((v) => Date.parse(v!))
    .sort((a, b) => a - b);
  try {
    const cutoff = createdMs[Math.floor(createdMs.length / 2)]!;
    const page = await call((t) =>
      searchDeals(t, {
        limit: 100,
        properties: ["createdate"],
        filterGroups: [
          {
            filters: [
              { propertyName: "createdate", operator: "GTE", value: String(cutoff) },
              { propertyName: "createdate", operator: "LT", value: String(Date.now()) },
            ],
          },
        ],
      }),
    );
    const allIn = page.results.every((r) => {
      const v = prop(r, "createdate");
      return v !== null && Date.parse(v) >= cutoff;
    });
    const narrowed = page.total < unfilteredTotal || createdMs[0]! < cutoff;
    record(
      "date_filter",
      allIn && narrowed ? "PASS" : "FAIL",
      `createdate GTE/LT epoch-ms push-down · total=${page.total} (from ${unfilteredTotal}) · all inside window=${allIn} · narrowed=${narrowed}`,
    );
  } catch (err) {
    record("date_filter", "FAIL", `date-filtered search → ${classify(err)}`);
  }

  // ── 8. Pipeline + stage filter push-down ──────────────────────────────────
  try {
    const targetPipeline = rowPipelines.find((p) => p !== null) ?? pipelineIds[0]!;
    const page = await call((t) =>
      searchDeals(t, {
        limit: 100,
        properties: ["pipeline", "dealstage"],
        filterGroups: [
          { filters: [{ propertyName: "pipeline", operator: "EQ", value: targetPipeline }] },
        ],
      }),
    );
    const allMatch = page.results.every((r) => prop(r, "pipeline") === targetPipeline);
    record(
      "pipeline_filter",
      allMatch && page.total <= unfilteredTotal ? "PASS" : "FAIL",
      `pipeline EQ push-down · total=${page.total} (unfiltered ${unfilteredTotal}) · all rows match=${allMatch}`,
    );

    const stageCounts = new Map<string, number>();
    for (const s of rowStages) if (s) stageCounts.set(s, (stageCounts.get(s) ?? 0) + 1);
    const targetStage = [...stageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!targetStage) {
      record("stage_filter", "SKIP", "no stage values observed to filter on");
    } else {
      const sp = await call((t) =>
        searchDeals(t, {
          limit: 100,
          properties: ["dealstage"],
          filterGroups: [
            { filters: [{ propertyName: "dealstage", operator: "EQ", value: targetStage }] },
          ],
        }),
      );
      const allStage = sp.results.every((r) => prop(r, "dealstage") === targetStage);
      record(
        "stage_filter",
        allStage && sp.total <= unfilteredTotal ? "PASS" : "FAIL",
        `dealstage EQ push-down · total=${sp.total} (unfiltered ${unfilteredTotal}) · all rows match=${allStage}`,
      );
    }
  } catch (err) {
    record("pipeline_filter", "FAIL", `pipeline/stage-filtered search → ${classify(err)}`);
  }

  // ── 9. Cursor pagination with the explicit sort ────────────────────────────
  try {
    const pageSize = Math.min(25, Math.max(2, Math.ceil(rows.length / 3)));
    const seen = new Set<string>();
    const createdSeq: number[] = [];
    const totals = new Set<number>();
    let after: string | null = null;
    let pages = 0;
    let duplicate = 0;
    let terminatedByCursor = false;
    while (pages < 5) {
      const body: Record<string, unknown> = {
        limit: pageSize,
        properties: ["createdate"],
        sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      };
      if (after) body.after = after;
      const page = await call((t) => searchDeals(t, body));
      pages += 1;
      totals.add(page.total);
      for (const r of page.results) {
        const id = String(r.id);
        if (seen.has(id)) duplicate += 1;
        seen.add(id);
        const v = prop(r, "createdate");
        if (v) createdSeq.push(Date.parse(v));
      }
      if (!page.nextAfter || page.results.length === 0) {
        terminatedByCursor = true;
        break;
      }
      after = page.nextAfter;
    }
    const ordered = createdSeq.every((v, i) => i === 0 || createdSeq[i - 1]! >= v);
    const reference = rows.slice(0, seen.size).map((r) => String(r.id));
    const skipped = reference.filter((id) => !seen.has(id)).length;
    record(
      "pagination",
      duplicate === 0 && ordered && skipped === 0 ? "PASS" : "FAIL",
      `pages walked=${pages} · pageSize=${pageSize} · distinct ids=${seen.size} · duplicates=${duplicate} · skipped vs reference prefix=${skipped} · createdate non-increasing=${ordered} · total stable across pages=${totals.size === 1} · terminated by missing next-cursor=${terminatedByCursor} · sorts+after accepted together=true`,
    );
  } catch (err) {
    record("pagination", "FAIL", `paged walk → ${classify(err)}`);
  }

  // ── 10. Empty window behaves as empty ──────────────────────────────────────
  try {
    const page = await call((t) =>
      searchDeals(t, {
        limit: 5,
        properties: ["createdate"],
        filterGroups: [
          {
            filters: [
              { propertyName: "createdate", operator: "GTE", value: String(Date.UTC(1971, 0, 1)) },
              { propertyName: "createdate", operator: "LT", value: String(Date.UTC(1972, 0, 1)) },
            ],
          },
        ],
      }),
    );
    record(
      "empty_window",
      page.total === 0 && page.results.length === 0 && page.nextAfter === null ? "PASS" : "FAIL",
      `total=${page.total} · rows=${page.results.length} · next cursor=${page.nextAfter !== null}`,
    );
  } catch (err) {
    record("empty_window", "FAIL", `empty-window search → ${classify(err)}`);
  }

  // ── 11. Rate-limit posture ─────────────────────────────────────────────────
  record(
    "rate_limit_metadata",
    rateHeadersSeen.length > 0 ? "PASS" : "SKIP",
    rateHeadersSeen.length > 0
      ? `x-hubspot-ratelimit-* headers observed on search responses (${rateHeadersSeen.length} header names) · sequential searches=${searchTimings.length} · 429s observed=${any429 ? "yes" : "no"} · min/median latency=${Math.min(...searchTimings)}ms/${[...searchTimings].sort((a, b) => a - b)[Math.floor(searchTimings.length / 2)]}ms (sequential awaits stay well under 5 req/s)`
      : "no x-hubspot-ratelimit headers observed",
  );

  summarize({ blocked: false });
}

function summarize(gate?: { blocked: boolean }): void {
  console.log("\n=== CD-4D Phase A summary ===");
  for (const r of results) console.log(`${r.verdict.padEnd(4)} ${r.check}`);
  if (!gate) {
    console.log("\nPHASE B AUTHORIZED: NO — prerequisites failed before any read");
    return;
  }
  const failed = results.filter((r) => r.verdict === "FAIL").map((r) => r.check);
  console.log(
    `\nPHASE B AUTHORIZED: ${
      failed.length === 0 && !gate.blocked
        ? "YES — every certified check passed"
        : `NO — ${gate.blocked ? "insufficient live data" : `failing: ${failed.join(", ")}`}`
    }`,
  );
}

main().catch((err) => {
  console.error("harness error:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
