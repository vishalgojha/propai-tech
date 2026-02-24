# PropAI Tech - Handoff

Date: 2026-02-24  
Project root: `C:\Users\visha\propai-tech`  
Branch: `main`

## Update - 2026-02-24 (Node 25 runtime alignment)

Issue addressed:

- Local and CI environment had drift against runtime constraints (project targeted Node 20.x while operator environment is Node 25.x).

Changes made:

- `package.json`
  - `engines.node`: `>=25 <26`
  - `packageManager`: `npm@11`
- `.node-version`
  - updated to `25`
- `.github/workflows/ci.yml`
  - `actions/setup-node` changed to `node-version: "25"`
- `README.md`
  - canonical dev path updated to Node `25.x` and npm `11.x`
- `install/install-propai.ps1`
  - installer tested-range warning now targets `25.x`

Git state:

- Commit: `13dbd23` (`chore: align project runtime to node 25`)
- Pushed: `origin/main` (2026-02-24)
- Working tree at push time: clean

Validation notes:

- Runtime/version metadata was aligned across package config, CI, local version file, docs, and installer.
- Full `npm ci`/`npm test` execution was not re-run in this pass after the Node 25 metadata change.

## Update - 2026-02-24 (npm ci registry fix)

Issue addressed:

- CI and local installs failed on `npm ci` with:
  - `404 Not Found - GET https://registry.npmjs.org/@vue-termui%2fcore`

Root cause:

- Root `package.json` still declared `@vue-termui/core` and `vue` as mandatory dependencies.
- `@vue-termui/core` is not resolvable in npm registry for the target environment, and TUI is optional at runtime.

Changes made:

- `package.json`
  - removed mandatory deps: `@vue-termui/core`, `vue`
- `src/cli/propai.ts`
  - updated fallback install hint to `npm install vue vue-termui`
  - changed TUI runtime detection to accept either `vue-termui` or legacy `@vue-termui/core`
- `src/cli/propai-termui.ts`
  - updated install hint to `npm install vue vue-termui`
  - candidate module order now prefers `vue-termui` then legacy `@vue-termui/core`
- `README.md`
  - updated terminal section wording to optional `vue-termui` runtime

Validation notes:

- Re-ran `npm ci` locally after patch:
  - the `@vue-termui/core` 404 no longer appears
  - install now fails later due local Windows permission error (`spawn EPERM`) and unsupported local engine (`Node v25.6.1`, project expects `>=20 <23`)
- `npm run build` could not run because dependencies were not installed in this environment.

## Current State

PropAI Tech now includes:

- session-based agent workflow (`start -> message -> approve/reject`)
- persistent session storage with PostgreSQL fallback to memory
- live session updates via SSE
- request rate limiting + redaction
- webhook verification + optional signature hardening
- risk-aware tool policy metadata and approval gating
- resale follow-up playbook assets (EN/HI templates + nurture buckets)
- queue-backed approval adapter (feature-flagged, direct fallback)
- React frontend shell scaffold in `web/`, with backend static serving from `/app`

Latest validation:

- `npm test` passed (`20/20`)

## Major Implementations

### 1) Session durability + live updates

- `src/agentic/suite/session-store.ts`
  - in-memory + PostgreSQL `agent_sessions` storage
- `src/agentic/suite/session-manager.ts`
  - async session operations, persistent save/load
  - event emitter for session updates
- `src/agentic/server.ts`
  - session APIs
  - `GET /agent/session/:id/events` (SSE stream + heartbeat)
- `src/agentic/frontend.ts`
  - EventSource subscription for live pending queue refresh

### 2) Security and policy hardening

- `src/agentic/whatsapp/inbound/signature.ts`
  - timing-safe `X-Hub-Signature-256` verification
- `src/agentic/server.ts`
  - `GET /whatsapp/webhook` verify challenge
  - `POST /whatsapp/webhook` signature check + payload summary
- `src/agentic/suite/tool-policy.ts`
  - centralized tool risk/action scope metadata
- `src/agentic/suite/types.ts`
  - risk metadata on tool/pending action views
- `src/agentic/suite/session-manager.ts`
  - risk-aware block/queue logic

### 3) Resale playbook import and wiring

- `src/agentic/data/resale-assets.ts`
  - domain prompt + EN/HI templates + nurture buckets
- `src/agentic/suite/resale-playbook.ts`
  - language/template/bucket selection and template rendering
- `src/agentic/suite/toolkit.ts`
  - `runSendWhatsappFollowup` now uses resale playbook metadata and nurture actions

### 4) Queue adapter (optional)

- `src/agentic/suite/execution-queue.ts`
  - `PROPAI_QUEUE_ENABLED` + Redis/BullMQ path
  - automatic direct-execution fallback when queue infra unavailable
- `src/agentic/server.ts`
  - `/agent/session/:id/approve` returns top-level `queue` metadata

### 5) React shell and progressive migration path

- `web/` created with Vite + React + TS:
  - `web/src/App.tsx`
  - `web/src/styles.css`
- backend `/app` serving behavior:
  - if `web/dist` exists: serve React app/static files on `/app` and `/app/*`
  - else: fallback to existing inline `FRONTEND_HTML` UI

## Documentation Updated

- `README.md`
  - new APIs and env vars
  - queue behavior and setup references
  - React web shell workflow
- `docs/waba-agent-reuse-map.md`
  - reuse decisions + implementation status
- `docs/queue-setup.md`
  - BullMQ/Redis runbook

## Environment Variables Added/Relevant

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `PROPAI_QUEUE_ENABLED`
- `PROPAI_QUEUE_NAME`
- `PROPAI_QUEUE_ATTEMPTS`
- `PROPAI_QUEUE_BACKOFF_MS`
- `PROPAI_QUEUE_CONCURRENCY`
- `PROPAI_QUEUE_TIMEOUT_MS`
- `REDIS_URL` (required when queue enabled)

## Known Blockers / Notes

1. `bullmq` dependency install is not completed in this environment due npm registry permission/network errors (`EACCES` while fetching).  
   Queue code is present and tested in fallback mode.

2. `web/` dependencies were scaffolded but not installed in this environment (install command timed out).  
   Backend fallback behavior is in place and tested without `web/dist`.

## Next Operator Steps

1. Install React shell deps and build:
   - `npm run web:install`
   - `npm run web:build`

2. If queue mode is needed:
   - install dependency: `npm install bullmq`
   - run Redis
   - set queue envs from `docs/queue-setup.md`

3. Re-verify:
   - `npm test`
   - `npm run dev`
   - open `/app` and confirm React shell loads when `web/dist` exists
