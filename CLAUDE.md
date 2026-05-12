# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository (`HaloNoteApp`).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9 (strict — `strictFunctionTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitOverride`)
- API: Express 5 (esbuild → CJS-banner-wrapped ESM bundle), pino + pino-http, helmet, cookie-parser, express-rate-limit
- DB: PostgreSQL via Drizzle ORM + `pg`, drizzle-kit migrations
- Auth: scrypt password hashing, session cookies + CSRF double-submit, role-based admin/member, optional TOTP 2FA
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval generates a react-query client and Zod schemas from `lib/api-spec/openapi.yaml`
- Frontend (provider-app): Vite 7 + React 19 + Tailwind 4 + wouter + TanStack Query + sonner + react-hook-form
- Frontend sandbox: Vite + React 19 + Tailwind 4 (Radix UI + shadcn-style components)
- Tests: vitest (unit + integration via supertest), React Testing Library + jsdom, Playwright (E2E)
- Container: multi-stage `Dockerfile`, non-root UID 10001, healthcheck via native fetch
- CI: GitHub Actions — typecheck, unit, integration (Postgres service container), E2E, Docker build smoke test

## Commands

Run from the workspace root unless noted.

- `pnpm --filter @workspace/api-server run dev` — build + start API server (requires `PORT`, `DATABASE_URL`)
- `pnpm --filter @workspace/provider-app run dev` — Vite dev server for the provider SPA
- `pnpm --filter @workspace/mockup-sandbox run dev` — Vite dev server (requires `PORT`, `BASE_PATH`)
- `pnpm run typecheck` — full typecheck across all packages (`tsc --build` for libs, then per-artifact `tsc --noEmit`)
- `pnpm run build` — typecheck + run every package's `build` script
- `pnpm run test` — unit tests across all packages
- `pnpm run test:integration` — api-server integration tests (requires `TEST_DATABASE_URL`)
- `pnpm --filter @workspace/provider-app run test:e2e` — Playwright E2E (auto-spawns api-server + Vite via webServer config)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate the react-query client and Zod schemas after editing `openapi.yaml`; this also reruns `typecheck:libs`
- `pnpm --filter @workspace/db run generate --name <slug>` — generate a SQL migration file under `lib/db/migrations/` after editing a schema file. Commit the generated SQL.
- `pnpm --filter @workspace/db run migrate` — apply pending migrations to the database pointed at by `DATABASE_URL`. This is the supported workflow; CI / deploy should use this.
- `pnpm --filter @workspace/db run push` — drizzle-kit `push` is kept as an escape hatch for ad-hoc experimentation in scratch databases. Do not use it on the dev or prod DB — it leaves no record of what changed.

## Workspace layout

The workspace has two roles for packages, enforced by `pnpm-workspace.yaml`:

- `lib/*` — internal libraries consumed via `workspace:*`. Compiled by the root `tsc --build` (project references in `tsconfig.json`). Source is the published entrypoint (`exports` points at `src/index.ts`); these are not pre-built.
- `artifacts/*` — deployable apps. Each owns its own `build` script and bundler config. Not consumed by other packages.
- `scripts/` — one-off TypeScript scripts run via `tsx`.

Packages:

- `lib/db` — Drizzle setup. `db` and `pool` are exported from `src/index.ts`; tables/schemas live under `src/schema/` and must be re-exported from `src/schema/index.ts` (one file per table is the convention shown in the placeholder).
- `lib/api-spec` — OpenAPI source of truth (`openapi.yaml`) + `orval.config.ts`. **Codegen writes into the other two `lib/api-*` packages' `src/generated/` directories**, not into `lib/api-spec` itself.
- `lib/api-zod` — Generated Zod request/response validators + TypeScript types. Used server-side. Do not edit `src/generated/`.
- `lib/api-client-react` — Generated react-query hooks + a hand-written `custom-fetch.ts` that all generated calls go through. Configure base URL / bearer auth via `setBaseUrl()` / `setAuthTokenGetter()` (the latter is for native bundles; web apps should rely on cookies).
- `lib/integrations/ehr` (`@workspace/ehr`) — FHIR R4 + EHR integration scaffold. Vendor-agnostic `FhirClient` (read/search/create/update with `OperationOutcome`-aware `FhirError`), two auth strategies (`OAuth2TokenProvider` for client_credentials w/ Basic auth, `JwtBearerAuthProvider` for SMART backend services w/ `private_key_jwt`), both implementing `TokenProvider`. JWT signing supports RS256/384/512 + ES256/384/512 and accepts a `JwtSigner` callback to delegate to KMS/HSM (private key never leaves the vault). `derToJose`/`joseToDer` in `auth/ecdsa.ts` bridge the DER↔JOSE format mismatch that KMS+ECDSA always hits. `DocumentReferencePusher` builds + POSTs a FHIR `DocumentReference` from a higher-level note input. Providers: `athenahealth` (uses `OAuth2TokenProvider`) and `epic` (uses `JwtBearerAuthProvider`). Subpath exports: `./fhir`, `./auth`, `./document-reference`, `./athenahealth`, `./epic`. No vendor URLs are hardcoded — all required as config.
- `artifacts/api-server` — Express app. `src/app.ts` mounts everything under `/api`; routes are added by importing into `src/routes/index.ts`. Bundled by `build.mjs` to a single `dist/index.mjs` with a CJS-compat banner so CJS-only deps (e.g. express) still work in the ESM output. Pino is bundled via `esbuild-plugin-pino` rather than externalized. Serves the SPA from `SPA_DIST_PATH` if set (production single-container deploy). Drizzle `migrate-on-boot` via `src/lib/run-migrations.ts`.
- `artifacts/provider-app` — Vite + React 19 SPA. Pages live under `src/pages/`, routed by wouter in `src/App.tsx`. Auth state via `src/lib/auth.tsx` (session-cookie based, calls `/api/auth/me` on mount). Component primitives in `src/components/ui/` (shadcn-style). E2E specs in `e2e/`, unit/component tests colocated with source.
- `artifacts/mockup-sandbox` — Vite app whose only job is to render React component previews. Drop a `.tsx` file under `src/components/mockups/` and visit `/{BASE_PATH}/preview/<path-without-.tsx>`. The `mockupPreviewPlugin` watches that directory and regenerates `src/.generated/mockup-components.ts` (a glob-import map). Files/folders prefixed with `_` are skipped. Default export wins, then `Preview`, then any named export matching the file's basename.

## API contract workflow

The OpenAPI spec is the source of truth. After editing `lib/api-spec/openapi.yaml`:

1. Run `pnpm --filter @workspace/api-spec run codegen`.
2. Server code uses Zod parsers from `@workspace/api-zod` (e.g. `HealthCheckResponse.parse(...)` in `routes/health.ts`).
3. Frontend code consumes generated react-query hooks + types from `@workspace/api-client-react`.

Generated files in `src/generated/` are clobbered on every codegen run — never hand-edit them.

## Conventions and gotchas

- **pnpm only.** The root `preinstall` script deletes `package-lock.json`/`yarn.lock` and refuses non-pnpm installs.
- **`minimumReleaseAge: 1440`** in `pnpm-workspace.yaml` blocks installing packages younger than 24 hours as a supply-chain defense. Do not disable it. To bypass for a specific trusted package, add it to `minimumReleaseAgeExclude`.
- **Dependency versions** for shared frontend deps (react, vite, tailwind, drizzle-orm, zod, etc.) come from the `catalog:` block — bump them there, not in individual `package.json`s. React is pinned to `19.1.0` exactly because Expo requires it.
- **Cross-platform scripts.** `pnpm-workspace.yaml` sets `shellEmulator: true` so scripts using `VAR=val cmd && cmd2` syntax work on Windows. Use that pattern over `export VAR=val && ...`. Git Bash (`sh` on PATH) is also required for the root `preinstall` script and the post-merge hook.
- **TypeScript:** workspace uses `"customConditions": ["workspace"]` so packages resolve to their TS sources. `tsc --build` is driven by the root `tsconfig.json` references; add new `lib/*` packages there.
- **`PORT` is required, not defaulted** for both `api-server` and `mockup-sandbox` — they throw on startup if missing. Both currently default to `8080` via the workspace-root `.env`, so they cannot run simultaneously without overriding one.
- **`.env` loading is per-app**, not automatic: `artifacts/api-server` loads it via `node --env-file=../../.env` in its `dev` script; `artifacts/mockup-sandbox`'s `vite.config.ts` calls `process.loadEnvFile()` because `--env-file` is not allowed in `NODE_OPTIONS`.
- **`post-merge.sh`** runs `pnpm install --frozen-lockfile && pnpm --filter @workspace/db run migrate` automatically after `git merge`, wired via `.githooks/post-merge` + `git config core.hooksPath .githooks` (set per-clone — re-set after `git clone`).
- **Integration tests run sequentially** (`fileParallelism: false`) because the test harness TRUNCATEs between files and audit-log fire-and-forget INSERTs would race the FK on `users`. The middleware exposes `pendingAuditWrites()` / `waitForPendingAudits()`; `resetTestDb()` awaits those before truncating.
- **Drizzle wraps pg errors.** `err.code === "23505"` doesn't always catch unique violations — Drizzle nests the original under `err.cause`. Use the `isUniqueViolation(err)` helper that checks both.
- **PHI in logs.** Pino is configured with redact paths covering `password`, `passwordHash`, request `body`, FHIR `content.text` / `description`, patient demographics (`firstName`, `lastName`, `dateOfBirth`, `mrn`), and OAuth secrets. Don't bypass the logger and don't log raw request bodies.

## Auth + security

- Session cookies: HTTP-only, SameSite=Lax, Secure in production. Sessions table is in DB.
- CSRF: double-submit token in `XSRF-TOKEN` cookie + `X-CSRF-Token` header. Generated middleware in `src/middlewares/csrf.ts`.
- Rate limiting: Postgres-backed (`rate_limit_buckets` table) — survives restarts and multi-replica deploys. Currently applied to `/auth/login`.
- Role gating: `requireAdmin` middleware. Admin-only routes: `GET /audit-log`, `GET /users`, `PATCH /users/:id`.
- Audit log: every authenticated request is logged async with `userId`, `action`, `resourceType`, `resourceId`, `metadata` (status + method). Retention cleanup runs in-process; the multi-replica advisory-lock variant is the recommended pattern when scaling out.

## Pointers

- See `README.md` for the user-facing project overview and run instructions.
