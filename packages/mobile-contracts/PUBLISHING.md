# Publishing @chainreact/mobile-contracts

> **Status: NOT YET PUBLISHED.** M0 made the package publish-ready. The first
> publish happens no earlier than M1 (after S0 staging exists) and only with
> Marcus's explicit approval. Nothing in the repo contains registry
> credentials, and nothing must ever.

## Registry and scope

- Registry: **GitHub Packages** (`https://npm.pkg.github.com`), pinned by this
  package's `publishConfig` so a stray `npm publish` can never target the
  public npm registry.
- Scope: `@chainreact`, owned by the ChainReact GitHub organization. The
  package is private to the org; ChainReactV2 and ChainReactMobile both read
  it with org credentials.

## Version policy

- Semantic versioning. `0.x` while the contract is pre-freeze; **`1.0.0` is
  claimed only when `/api/mobile/v1` is frozen for the first store release.**
- **Published versions are immutable.** Never republish or unpublish a
  version to change its contents — a bad release is superseded by the next
  version, and a broken consumer rolls back by pinning the previous one.
- Every publish requires, in the same change: a `CHANGELOG.md` entry, a
  version bump in `package.json`, and (on release) a git tag
  `mobile-contracts-v<semver>` on the ChainReactV2 commit that produced it.

## CI flow (to be added to ChainReactV2 CI when publishing begins)

A `publish-mobile-contracts` GitHub Actions workflow, manually dispatched (or
tag-triggered on `mobile-contracts-v*`), that runs in order:

1. `npm ci`
2. `npm run typecheck` · `npm run lint` · `npm run lint:structure`
3. The package's focused test suites
   (`tests/unit/packages/mobile-contracts/`, `tests/structure/mobile-contracts-*`,
   `tests/structure/contracts-purity*`)
4. `npm run mobile-contracts:pack:check` — the artifact-content gate
5. `npm publish ./packages/mobile-contracts` — authenticated via the
   **organization-managed `GITHUB_TOKEN` / an org Actions secret with
   `packages:write`**, injected by Actions at run time. Tokens are never
   committed, never placed in `.npmrc` files in the repo, never echoed in
   logs.

A publish from a developer machine is prohibited once CI publishing exists;
until then, a manual publish follows the same steps 1–4 locally and uses a
short-lived personal token supplied via the environment for step 5 only.

## Consumption

- **ChainReactMobile (production path):** `.npmrc` maps the `@chainreact`
  scope to GitHub Packages; the app **pins an exact version**
  (`"@chainreact/mobile-contracts": "0.1.0"` — no `^`/`~`, and never a
  mutable `latest` in a production build). EAS builds read the org token from
  an EAS secret, not from the repo.
- **Local development without publishing:** `npm run mobile-contracts:pack`
  in ChainReactV2, then install the produced tarball path (or a `file:` path
  to the package folder) in the mobile checkout. Git dependencies are NOT a
  supported distribution mechanism.

## Rollback

Consumer-side: pin back to the previous version and rebuild — immutability
guarantees the old artifact is still there, byte-identical. Registry-side:
nothing is ever mutated; a defective version is marked in the CHANGELOG as
"do not use" and superseded.
