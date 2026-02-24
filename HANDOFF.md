# PropAI Tech - Handoff

Date: 2026-02-24  
Project root: `C:\Users\visha\propai-tech`  
Branch: `main`

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
