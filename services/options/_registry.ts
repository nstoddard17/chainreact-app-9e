import {
  OPTIONS_SOURCE_KEY_REGEX,
  type OptionsResolver,
} from "./types";

// Fixture resolver (Slice 3.30). Stays registered so smoke / route /
// integration tests have a provider-mock-free baseline.
import { nativeExamplesResolver } from "./fixtures/nativeExamples";

// First real provider resolver — Slice 3.32 (Slack channels picker for
// `slack:upload_file.channel`).
import { slackChannelsResolver } from "@/integrations/slack/options/channels";

/**
 * Hand-maintained options-source resolver registry.
 *
 * Plan reference: docs/slices/phase-3/options-source-plan.md §5.
 *
 * Discipline mirrors `services/discovery/_registry.ts`:
 *   - Explicit imports surface in PRs — adding a resolver means
 *     adding the import + an entry in `ALL_RESOLVERS`.
 *   - Module-load validation:
 *     - Every `source` matches the `<provider>:<resource>` regex.
 *     - Duplicate sources throw at module load with a clear error.
 *   - The exported lookup map is frozen — no runtime mutation.
 *
 * Why hand-maintained rather than glob-style auto-discovery:
 *   - Reviewers scan the diff to see exactly which resolvers a slice
 *     covers; no implicit auto-registration.
 *   - Resolver placement is colocated under each provider tree
 *     (`integrations/<provider>/options/<resource>.ts`) — the central
 *     registry is the audit surface, not the discovery mechanism.
 *
 * Server-only — never imported by client code. The structural test
 * at `tests/structure/client-server-boundary.test.ts` catches any
 * non-type-only import of `@/services/options/...` from
 * `features/` / `components/` / `lib/api/` / `stores/`.
 */

export const ALL_OPTIONS_RESOLVERS: ReadonlyArray<OptionsResolver> = [
  nativeExamplesResolver,
  slackChannelsResolver,
];

// Module-load validation. Throws synchronously so any importer of this
// module fails the build with a clear message rather than a runtime
// surprise on the first request.
const resolverBySource: ReadonlyMap<string, OptionsResolver> = (() => {
  const m = new Map<string, OptionsResolver>();
  for (const r of ALL_OPTIONS_RESOLVERS) {
    if (!OPTIONS_SOURCE_KEY_REGEX.test(r.source)) {
      throw new Error(
        `Options resolver source '${r.source}' does not match <provider>:<resource> regex.`,
      );
    }
    const expected = `${r.provider}:`;
    if (!r.source.startsWith(expected)) {
      throw new Error(
        `Options resolver source '${r.source}' does not start with declared provider '${r.provider}'.`,
      );
    }
    if (m.has(r.source)) {
      throw new Error(
        `Duplicate options resolver registered for source '${r.source}'.`,
      );
    }
    m.set(r.source, r);
  }
  return m;
})();

/**
 * Look up a resolver by its `source` key. Returns `undefined` when
 * the source isn't registered — the route maps that to a
 * `SOURCE_NOT_FOUND` response.
 */
export function getOptionsResolver(source: string): OptionsResolver | undefined {
  return resolverBySource.get(source);
}

/**
 * Stable, deterministic list of all registered resolvers, sorted by
 * `source`. Exposed primarily so structural / registry tests can
 * assert coverage shape without relying on an `Object.entries`-style
 * iteration order; also useful when the future admin tooling lists
 * known sources.
 */
export function listOptionsResolvers(): ReadonlyArray<OptionsResolver> {
  return [...resolverBySource.values()].sort((a, b) =>
    a.source < b.source ? -1 : a.source > b.source ? 1 : 0,
  );
}
