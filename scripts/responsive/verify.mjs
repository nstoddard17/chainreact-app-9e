/**
 * RESPONSIVE-CERTIFICATION-10 — the one supported responsive verification command.
 *
 *   npm run verify:responsive
 *
 * WHY THIS EXISTS. Every product surface was swept individually, but each sweep
 * lived in its own script under `scripts/trash/` — a directory the repo defines as
 * disposable and that ESLint deliberately ignores. Reproducing a full check meant
 * remembering three script paths, a Jest `--testMatch` incantation and a Tailwind
 * build, in the right order. Verification that depends on someone remembering is
 * verification that stops happening. This is that knowledge, executable.
 *
 * ONE SHARED BUILD. The whole point of certification is that surfaces which pass
 * in isolation still pass TOGETHER, from one current build of the app's CSS. So
 * this runs the three passes against a single freshly-compiled `tailwind.css` and
 * one freshly-emitted fixture set — never against whatever happened to be left in
 * `owner-review/` from an earlier run. A stale artifact is how a green
 * certification lies.
 *
 * WHAT IT DOES NOT DO. It does not start Supabase, Docker or a dev server, and it
 * touches no database. The fixtures are rendered by Jest from real components;
 * the measurement is pure geometry in Chromium. That is what makes a full
 * 1600→360 certification runnable on an ordinary machine.
 *
 * Flags:
 *   --shots      also write the named-width screenshots (slow; owner evidence)
 *   --skip-emit  reuse the fixtures already in owner-review/html (debugging only)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const HTML_DIR = join(ROOT, "owner-review", "html");
const CSS = join(HTML_DIR, "tailwind.css");

const args = new Set(process.argv.slice(2));
const WANT_SHOTS = args.has("--shots");
const SKIP_EMIT = args.has("--skip-emit");

/**
 * The fixture emitters that feed the sweep. `documentScreens` is deliberately NOT
 * here: it emits `document-*` fragments for a different (non-responsive) harness
 * and no measurement pass consumes them.
 */
const EMITTERS = [
  "templatesScreens",
  "workflowsScreens",
  "accountSettingsScreens",
  "teamScreens",
  "dataSurfaceScreens",
  "builderRunsScreens",
  // SPREADSHEET-GUIDED-CONFIG-S3 — the guided node-configuration panel. The
  // first guided surface with unbounded content (a twenty-column worksheet
  // inside a 331px overlay sheet), so it is measured before the editor that
  // makes it unbounded ships.
  "builderConfigScreens",
  "authScreens",
  "marketingScreens",
];

/**
 * The measurement passes. Each owns the surfaces whose page frame it can honestly
 * reproduce — which is why there are three rather than one: the signed-in app
 * renders inside a rail + top bar, auth and marketing are full-bleed surfaces that
 * bring their own scoped stylesheets. Wrapping any of them in another's chrome
 * would measure a page that does not exist.
 */
const PASSES = [
  { name: "app shell", script: "measure-app-shell.mjs", covers: "Templates · Workflows · Account · Team · Runs · Builder Runs · shared shell" },
  { name: "auth", script: "measure-auth.mjs", covers: "sign-in · sign-up · verify · recovery · MFA" },
  { name: "marketing", script: "measure-marketing.mjs", covers: "home · pricing · help · legal · header/footer" },
];

function run(label, cmd, cmdArgs, { env = {}, shell = false } = {}) {
  const started = Date.now();
  const res = spawnSync(cmd, cmdArgs, {
    stdio: "inherit",
    shell,
    env: { ...process.env, ...env },
  });
  return { label, status: res.status ?? 1, seconds: ((Date.now() - started) / 1000).toFixed(1) };
}

/**
 * Jest is invoked DIRECTLY rather than through `npm test`, for two reasons that
 * both bite on Windows: routing through a shell lets cmd.exe eat the `|` in the
 * testMatch alternation, and the repo's runner needs
 * `--experimental-vm-modules` (see docs/rules/testing-strategy.md — a bare jest
 * fails any suite that parses PDFs). This mirrors the `test` script exactly.
 */
const JEST = ["--experimental-vm-modules", join("node_modules", "jest", "bin", "jest.js")];

console.log("\n=== ChainReact responsive certification ===");
console.log("One shared build · 360→1600px continuous · containment · legibility · panning\n");

// ---------------------------------------------------------------- 1. fixtures
if (!SKIP_EMIT) {
  // Clear stale fragments first. Reusing a previous run's HTML is how a surface
  // that no longer renders keeps "passing" long after it broke.
  if (existsSync(HTML_DIR)) {
    for (const f of readdirSync(HTML_DIR)) {
      if (f.endsWith(".html")) rmSync(join(HTML_DIR, f));
    }
  }
  mkdirSync(HTML_DIR, { recursive: true });

  const pattern = `**/tests/tools/(${EMITTERS.join("|")}).harness.test.tsx`;
  console.log(`→ emitting fixtures from ${EMITTERS.length} harnesses`);
  const emit = run("fixtures", process.execPath, [...JEST, `--testMatch=${pattern}`, "--silent"]);
  if (emit.status !== 0) {
    console.error("\nFAIL — fixture emission failed. The measurement would be meaningless.");
    process.exit(1);
  }
}

const fragments = existsSync(HTML_DIR)
  ? readdirSync(HTML_DIR).filter((f) => f.endsWith(".html")).length
  : 0;
if (fragments === 0) {
  console.error("\nFAIL — no fixtures to measure.");
  process.exit(1);
}
console.log(`  ${fragments} fixture states ready\n`);

// ------------------------------------------------------------------- 2. CSS
console.log("→ compiling one Tailwind build for every pass");
const css = run("tailwind", "npx", [
  "tailwindcss", "-i", "app/globals.css", "-o", "owner-review/html/tailwind.css", "--minify",
], { shell: process.platform === "win32" });
if (css.status !== 0 || !existsSync(CSS)) {
  console.error("\nFAIL — could not build the stylesheet the measurement reads.");
  process.exit(1);
}
console.log("");

// -------------------------------------------------------------- 3. measure
const results = [];
for (const pass of PASSES) {
  console.log(`→ ${pass.name}: ${pass.covers}`);
  results.push(
    run(pass.name, process.execPath, [join("scripts", "responsive", pass.script)], {
      env: { SHOTS: WANT_SHOTS ? "1" : "0" },
    }),
  );
  console.log("");
}

// --------------------------------------------------------------- 4. verdict
const failed = results.filter((r) => r.status !== 0);
console.log("=== certification summary ===");
for (const r of results) {
  console.log(`  ${r.status === 0 ? "PASS" : "FAIL"}  ${r.label.padEnd(10)} (${r.seconds}s)`);
}
console.log(`  ${fragments} fixture states across ${PASSES.length} passes, one shared build`);
if (!WANT_SHOTS) console.log("  screenshots skipped — re-run with --shots for owner evidence");

if (failed.length > 0) {
  console.log(`\nNOT CERTIFIED — ${failed.length} of ${PASSES.length} passes failed: ${failed.map((f) => f.label).join(", ")}`);
  process.exit(1);
}
console.log("\nCERTIFIED — every swept surface passes together from this build.");
process.exit(0);
