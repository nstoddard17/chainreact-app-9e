# @chainreact/mobile-contracts

**The only public transport contract between the ChainReactV2 backend and the
ChainReactMobile app.** Zod schemas (the runtime authority) and inferred
TypeScript types for every `/api/mobile/v1` request, response, error envelope,
deep-link target, and push payload. If a shape is not exported from this
package's barrel, it is not part of the mobile contract.

Plan of record:
`docs/slices/phase-5/mobile-companion/mobile-companion-foundation-plan.md`
(ChainReactV2 repo).

## What this package guarantees

- **Mobile-safe by construction.** No repository row types, service-role
  concepts, OAuth/token fields, provider secrets, raw provider responses,
  trigger payloads, unredacted run output, or server configuration — enforced
  by boundary, denylist, and shape tests in the web repo.
- **Structural rejection of dangerous data.** The run step/detail, push data,
  deep-link, and app-config schemas are `.strict()`: a payload carrying step
  `output`, a `triggerEvent`, a `fatalError`, or any smuggled extra field
  **fails to parse**. Rejecting is the feature.
- **Pinned parity with the backend.** Shared enums (workflow states, run
  statuses, humanized-error actions, account types/roles, error codes) are
  mirrored from the web contracts and pinned by parity tests that run in
  ChainReactV2 CI — drift fails the build on the server side, where it can be
  fixed before it ships.
- **Zero dependencies at runtime** except a `zod` peer. No React, no node
  builtins, no ChainReact path aliases — the compiled output runs identically
  in React Native (Metro), Node, and Jest.

## Strictness policy

Security-critical shapes (`MobileRunStepSchema`, `MobileRunDetailSchema`,
`MobilePushDataSchema`, `MobileDeepLinkTargetSchema`,
`MobileAppConfigSchema`, confirmation detail, integration health) are
`.strict()` — unknown fields are rejected. Other response shapes use zod's
default strip mode, so additive server evolution never breaks a pinned
client. The final strict-vs-tolerant split is re-confirmed when the contract
freezes at `1.0.0` for the first store release; until then this package is
pre-release (`0.x`) and shapes may still change with a minor bump.

## Versioning

- `MOBILE_CONTRACTS_SCHEMA_VERSION` — wire-shape semantics generation
  (travels in push payloads as `v`).
- npm semver — release mechanics. Published versions are **immutable**;
  ChainReactMobile pins an exact version. `1.0.0` is claimed only when
  `/api/mobile/v1` freezes for the first store release.

## Consuming (ChainReactMobile)

Published to **GitHub Packages** under the ChainReact organization (see
`PUBLISHING.md`; not yet published — M0 makes it publish-ready only).

```jsonc
// .npmrc (mobile repo)
@chainreact:registry=https://npm.pkg.github.com
```

```bash
npm install @chainreact/mobile-contracts@0.1.0 zod
```

Local development against a checkout, without publishing:

```bash
# in ChainReactV2
npm run mobile-contracts:pack        # emits packages/mobile-contracts/chainreact-mobile-contracts-<v>.tgz
# in ChainReactMobile
npm install ../ChainReactV2/packages/mobile-contracts/chainreact-mobile-contracts-<v>.tgz
```

## Building (ChainReactV2 repo)

```bash
npm run mobile-contracts:build        # tsc → dist/ (gitignored)
npm run mobile-contracts:pack         # build + create the local tarball
npm run mobile-contracts:pack:check   # build + validate the publish artifact's contents
```

The pack check fails if the artifact would contain anything beyond
`package.json`, `README.md`, `CHANGELOG.md`, `dist/**` (js + d.ts only), and
`fixtures/**` — no sources, no source maps, no tests, no env files, no repo
internals.

## Fixtures

`fixtures/v1/` ships in the package: synthetic, obviously-fake request/response
samples that both repos parse in CI (the two-sided compatibility suite).
`fixtures/v1/negative/` holds payloads that MUST fail to parse — run output,
trigger events, fatal errors, credential-shaped fields. Never place a real
identifier, token, email, or customer value in a fixture.
