/**
 * @chainreact/mobile-contracts — public barrel.
 *
 * THE ONLY transport contract between the ChainReactV2 backend
 * (`/api/mobile/v1`) and the ChainReactMobile app. Everything exported here
 * is mobile-safe by design and enforced by tests in the web repo:
 *
 *   - purity: this package imports zod and its own siblings, nothing else
 *     (no `@/` aliases, no server modules, no React, no node builtins);
 *   - denylist: no schema carries secret/credential/raw-provider fields;
 *   - structural rejection: run + push shapes are `.strict()` — outputs,
 *     trigger events, fatal errors, and smuggled fields FAIL to parse;
 *   - parity: shared enums are pinned to the web contracts they mirror.
 *
 * Add exports ONLY via this barrel; the web repo's boundary test treats it as
 * the machine-readable allow-list.
 */
export * from "./version";
export * from "./errors";
export * from "./pagination";
export * from "./accounts";
export * from "./workflows";
export * from "./humanizedError";
export * from "./runs";
export * from "./integrationHealth";
export * from "./usage";
export * from "./deepLink";
export * from "./push";
export * from "./appConfig";
