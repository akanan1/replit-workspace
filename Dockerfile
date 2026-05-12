# syntax=docker/dockerfile:1.7
#
# Combined api-server + provider-app SPA image. The api-server serves
# /api/* and the SPA's built static assets from the same Node process,
# so cookies stay same-origin and there's only one container to deploy.
#
# Build:   docker build -t halonote .
# Run:     docker run --rm -p 8080:8080 \
#            -e DATABASE_URL=... \
#            halonote

ARG NODE_VERSION=24

# -----------------------------------------------------------------------------
# base — pnpm + workdir, shared by deps and build.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS base
RUN corepack enable
WORKDIR /app

# -----------------------------------------------------------------------------
# deps — install workspace deps with the lockfile alone, so this layer
# only invalidates when a package.json changes.
# -----------------------------------------------------------------------------
FROM base AS deps

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/provider-app/package.json artifacts/provider-app/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/db/package.json lib/db/
COPY lib/integrations/ehr/package.json lib/integrations/ehr/
COPY scripts/package.json scripts/

# CI=true bypasses pnpm's "remove modules dir" TTY prompt. We don't
# need optional dev tooling like Playwright browsers in the image — those
# install into ~/.cache/ms-playwright which we'll never invoke.
RUN CI=true pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# build — typecheck the lib references first, then build both artifacts.
# Both `vite build` and the api-server's esbuild bundler produce
# self-contained output we can copy into the runtime image.
# -----------------------------------------------------------------------------
FROM deps AS build

COPY . .

RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/provider-app run build
RUN pnpm --filter @workspace/api-server run build

# -----------------------------------------------------------------------------
# runtime — a minimal image that just needs Node + the build outputs +
# the migrations directory. Drops privileges before running.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    SPA_DIST_PATH=/app/public \
    DB_MIGRATIONS_PATH=/app/migrations \
    SHUTDOWN_DRAIN_MS=10000

WORKDIR /app

# Run as a dedicated non-root user. UID 10001 keeps us out of any
# host UID range a sane orchestrator might assign.
RUN groupadd --system --gid 10001 halonote \
 && useradd --system --no-create-home --uid 10001 --gid halonote halonote

COPY --from=build --chown=halonote:halonote /app/artifacts/api-server/dist ./dist
COPY --from=build --chown=halonote:halonote /app/artifacts/provider-app/dist ./public
COPY --from=build --chown=halonote:halonote /app/lib/db/migrations ./migrations

USER halonote
EXPOSE 8080

# Hits the same endpoint the test harness uses; cheap, no DB.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
